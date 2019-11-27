import ControlChart from "../components/ControlChart.jsx";/* @flow weak */

import d3 from "d3"

type SankeyProps = {
  chartType: "sankey",
  isScalarSeries: boolean,
  maxSeries: number,
};

function buildChartData(columnValues, xKey, yKey) {
    if (!xKey || !yKey) { return []; }
    const xValues = columnValues[xKey];
    return xValues.reduce( (data, xValue, index) => {
        return [
            ...data,
            {
                x: xValue,
                value: columnValues[yKey][index],
                index,
            }
        ]
    }, []);
}

function controlChartRenderer(element: Element, props: SankeyProps, ): DeregisterFunction {
    const { width, height, data, settings } = props;
    console.warn('props',props);
    const columnValues = data.cols.reduce( (colVals, col, index) => {
        const values = data.rows.map( row => row[index]);
        return {
            ...colVals,
            [col.name]: values,
        }
    },{});
    const xKey = settings['graph.dimensions'][0];
    const yKey = settings['graph.metrics'][0];
    const chartData = buildChartData(columnValues, xKey, yKey);

    renderControlChart(element, chartData, settings, width, height);
    return () => {
      // dc.chartRegistry.deregister(parent);
    };
}

import { ZONE_SETTINGS } from '../lib/settings/zones';

export default class Control extends ControlChart {
    static uiName = `Control`;
    static identifier = "control";
    static iconName = "control";
    // UKNOWN WHAT noun IS USED FOR
    static noun = `Control chart`;

    static settings = {
        ...ZONE_SETTINGS,
        // ...GRAPH_DATA_SETTINGS,
    };

    static renderer = controlChartRenderer;
}

const MARGIN_BOTTOM = 50;
const MARGIN_LEFT = 75;
const MARGIN_RIGHT = 25;
const MARGIN_TOP = 50;

const DATA_BUFFER_PCT = 10;

const getXScale = (count, width) => {
    return d3.scale.linear()
        .domain([0, count])
        .range([MARGIN_LEFT, width - MARGIN_RIGHT]);
}

const getYScale = (yRange, height, bufferPct = DATA_BUFFER_PCT) => {
    const {max, min} = yRange;
    const buffer = (max - min) * (bufferPct/100);
    return d3.scale.linear()
        .domain([min - buffer, max +  buffer])
        .range([height - MARGIN_BOTTOM, MARGIN_TOP]);
}

const getYRange = data => {
    return data.reduce( (range, {value}) => {
        let { max, min } = range;
        if (max < value) { max = value; }
        if (min > value) { min = value; }
        return {max, min};
    }, {max: -Infinity, min:Infinity});
}

const getXAxis = (xScale, data, height) => {
    return chart => {
        chart.append('g')
            .attr('transform', `translate(0,${height - MARGIN_BOTTOM})`)
            .attr('class', 'axis x')
            .call(d3.svg.axis().scale(xScale).orient('bottom').innerTickSize(2).tickFormat( d => {
                const xd = data[d]
                return xd ? xd.x : '';
            }));
    }
}

const getYAxis = (yScale, width, side = 'left' ) => {
    return chart => {
        let axis = d3.svg.axis().scale(yScale)
        axis = side === 'left' ? axis.orient('left') : axis.orient('right');
        const translate = side === 'left' ? MARGIN_LEFT : width-MARGIN_RIGHT;
        chart.append('g')
            .attr('transform', `translate(${translate}, 0)`)
            .attr('class', 'axis y')
            .call(axis.innerTickSize(2).tickFormat( d => d ));
    }
}

const getLines = (data, xScale, yScale) => {
    let prevItem = null;
    return data.reduce( (lines, item, index) => {
        if (index === 0) {
            prevItem = item;
            return lines;
        }
        const path = `M${xScale(prevItem.index)},${yScale(prevItem.value)}L${xScale(item.index)},${yScale(item.value)}`;
        prevItem = item;
        return [
            ...lines,
            path,
        ]
    }, []);
}

const getZoneRects = (zones = [], xScale, yScale, dataCount) => {
    if (!zones) { return []; }
    return zones.reduce( (rects, zone) => {
        if (!zone.range) { return rects; }
        const color = d3.rgb(zone.color)
        color.opacity = .5
        return [
            ...rects,
            {
                x0: xScale(0),
                x1: xScale(dataCount),
                y0: yScale(zone.range[0]),
                y1: yScale(zone.range[1]),
                color: color.toString(),
            }
        ]
    }, []);
}

function renderControlChart(element, data, settings, width, height) {
    const zones = settings['graph.zones'];
    // The length of the data array is the number of series
    const xScale = getXScale(data.length, width);
    const yRange = getYRange(data);
    const yScale = getYScale(yRange, height);
    const lines = getLines(data, xScale, yScale);
    const zoneRects = getZoneRects(zones, xScale, yScale, data.length);
    const chart = d3.select(element)
                    .append('svg')
                    .attr('viewBox', [0,0,width,height])
                    .attr('class', 'chassi-control-chart');

    // Draw zone Rects
    chart.selectAll('rect')
        .data(zoneRects)
        .enter().append('rect')
            .attr('x', d => d.x0)
            .attr('y', d => d.y0)
            .attr('opacity', 0.5)
            .attr('width', d => d.x1 - d.x0)
            .attr('height', d => d.y1 - d.y0)
            .attr('fill', d => d.color)

    // Draw zone lines
    chart.selectAll('path.zone-line')
        .data(zones || [])
        .enter().append('path')
            .attr('class', 'zone-line')
            .attr('d', d => `M${xScale(0)},${yScale(d.level)},L${xScale(data.length)},${yScale(d.level)}`)
            .attr('stroke', d => d.color)
            .attr('stroke-width', 2)

    // Draw Line
    chart.selectAll('path.line')
        .data(lines)
        .enter().append('path')
            .attr('class','line')
            .attr('d', line => line)
            .attr('stroke-width', 2)
            .attr('stroke', d3.rgb(85,85,85))
            .attr('fill','none')

    // Draw points
    chart.selectAll('circle')
        .data(data)
        .enter().append('circle')
            .attr('cx', d => xScale(d.index))
            .attr('cy', d => yScale(d.value))
            .attr('r', 2)
            .attr('stroke-width', 2)
            .attr('stroke', d3.rgb(70,130,180))
            .attr('fill', d3.rgb(255,255,255))

    const showYAxisLabel = settings['graph.y_axis.labels_enabled'];
    const showXAxisLabel = settings['graph.x_axis.labels_enabled'];

    const xAxis = getXAxis(xScale, data, height, );
    const yAxis = getYAxis(yScale, width,);

    chart.call(xAxis);
    chart.call(yAxis);

    if (showXAxisLabel) {
        chart.append('text')
            .attr('class', 'x axis-label')
            .attr('transform', `translate(${width/2}, ${height - 10})`)
            .text(settings['graph.x_axis.title_text']);
    }

    if (showYAxisLabel) {
        chart.append('text')
            .attr('class', 'y axis-label')
            .attr('transform', `rotate(-90)`)
            .attr('y', 0)
            .attr('x', -height/2)
            .attr('dy', '1em')
            .text(settings['graph.y_axis.title_text']);
    }
}

// TEST DATA ONLY
// const testData = [
//     {
//         x: 1,
//         value: 100,
//     },
//     {
//         x: 2,
//         value: 125,
//     },
//     {
//         x: 3,
//         value: 75,
//     },
//     {
//         x: 4,
//         value: 120,
//     },
//     {
//         x: 5,
//         value: 40,
//     },
//     {
//         x: 6,
//         value: 75,
//     },
//     {
//         x: 7,
//         value: 110,
//     },
//     {
//         x: 8,
//         value: 60,
//     },
//     {
//         x: 9,
//         value: 155,
//     },
//     {
//         x: 10,
//         value: 95,
//     },
//     {
//         x: 11,
//         value: 100,
//     },
//     {
//         x: 12,
//         value: 125,
//     },
//     {
//         x: 13,
//         value: 75,
//     },
//     {
//         x: 14,
//         value: 120,
//     },
//     {
//         x: 15,
//         value: 40,
//     },
//     {
//         x: 16,
//         value: 75,
//     },
//     {
//         x: 17,
//         value: 110,
//     },
//     {
//         x: 18,
//         value: 60,
//     },
//     {
//         x: 19,
//         value: 150,
//     },
//     {
//         x: 20,
//         value: 95,
//     },
// ]

// const standardZones = [
//     {
//         range: [179,150],
//         level: 150,
//         color: '#ff0400',
//     },
//     {
//         range: [150,130],
//         level: 130,
//         color: '#CF3935',
//     },
//     {
//         range: [130, 110],
//         level: 110,
//         color: '#fde455',
//     },
//     {
//         range: [110,70],
//         level: 90,
//         color: '#7bb31f',
//     },
//     {
//         range: [70,50],
//         level: 70,
//         color: '#fde455',
//     },
//     {
//         range: [50, 30],
//         level: 50,
//         color: '#CF3935',
//     },
//     {
//         range: [30, 0],
//         level: 30,
//         color: '#ff0400',
//     },
// ]