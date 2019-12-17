import d3 from "d3"

type SankeyProps = {
  chartType: "sankey",
};

const MARGIN = {
    bottom: 100,
    left: 75,
    right: 25,
    top: 50,
}

const DATA_BUFFER_PCT = 10;

const getXScale = (count, width) => {
    return d3.scale.linear()
        .domain([0, count])
        .range([MARGIN.left, width - MARGIN.right]);
}

const getYScale = (yRange, height, bufferPct = DATA_BUFFER_PCT) => {
    const {max, min} = yRange;
    const buffer = (max - min) * (bufferPct/100);
    return d3.scale.linear()
        .domain([min - buffer, max +  buffer])
        .range([height - MARGIN.bottom, MARGIN.top]);
}

const getYRange = data => {
    return data.reduce( (range, {value}) => {
        let { max, min } = range;
        if (max < value) { max = value; }
        if (min > value) { min = value; }
        return {max, min};
    }, {max: -Infinity, min:Infinity});
}

const getXAxis = (xScale, data, visHeight, visWidth, label) => {
    const axisLabelMargin = 25;
    let angle = 0;
    const axisWidth = visWidth - MARGIN.right - MARGIN.left;
    const tickWidth = axisWidth / data.length-1;

    return chart => {
        let maxTickHeight = 0;
        const axis = chart.append('g')
            .attr('class', 'axis x')
            .call(d3.svg.axis().scale(xScale).orient('bottom').innerTickSize(2).tickFormat( d => {
                const xd = data[d]
                return xd ? xd.x : '';
            }));

        chart.selectAll('.x.axis .tick text')
            .each( function(d,i,a) {
                const { width, height } = this.getBBox();
                console.warn('tick w:', width, ', tw:', tickWidth, ', h:', height);
                if (angle !== -90 && width >= tickWidth) angle = -45;
                if (height >= tickWidth) angle = -90;
            })
            .attr('transform', function(d, i) {
                const { width, height } = this.getBBox();
                const xTranslate = (height/2 * (angle/90));
                return `translate(${xTranslate}, 0) rotate(${angle})`;
            })
            .style('text-anchor', () => {
                if (angle < 0) { return 'end'; }
                if (angle > 0) { return 'start' }
                return 'middle';
            });

        chart.selectAll('.x.axis .tick')
            .each( function() {
                // get the max tick height for bottom margin computation
                const { height } = this.getBBox();
                if (height > maxTickHeight) maxTickHeight = height;
            })

        if (label)
            chart.append('text')
                .attr('class', 'x axis-label')
                .attr('transform', `translate(${visWidth/2}, ${visHeight - 10})`)
                .text(label);

        MARGIN.bottom = maxTickHeight + axisLabelMargin;
        axis.attr('transform', `translate(0,${visHeight - MARGIN.bottom})`);
    }
}

const getYAxis = (yScale, width, side = 'left' ) => {
    return chart => {
        let axis = d3.svg.axis().scale(yScale)
        axis = side === 'left' ? axis.orient('left') : axis.orient('right');
        const translate = side === 'left' ? MARGIN.left : width-MARGIN.right;
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

const parseZonesFromQuery = (zones = []) => {
    if (!zones) { return []; }
    // Coming in from the query the format is string like:
    // {"{\"color\": \"#cf3935\", \"line\": \"0\", \"upper\": \"20\", \"lower\": \"-20\"}","{\"color\": \"#cf3935\", \"line\": \"0\", \"upper\": \"20\", \"lower\": \"-20\"}"}
    // Remove the starting and trailing curly braces and double quotes {"..."}
    let parsedZones = zones.substring(2,zones.length-2);
    // remove the quotes between each object. Add a vertical bar for splitting at correct comma later
    parsedZones = parsedZones.replace(/\",\"/g, ',|');
    // Remove all \ for escaping quotes
    parsedZones = parsedZones.replace(/\\/g,'');
    // split on comma (And vertical bar) which is between each object
    parsedZones = parsedZones.split(',|')
    // Parse each JSON string.
    parsedZones = parsedZones.map( r => JSON.parse(r) );
    // Map to expecte zone format with range array
    return parsedZones.map( zone => ({
        ...zone,
        line: zone.level,
        range: [zone.upper, zone.lower],
    }));
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

const getZoneLinePositions = (zones=[]) => {
    return zones.reduce( (lines, zone) => {
        if (zone.level === null || zone.level === undefined || zone.level === '') { return lines; }
        return [
            ...lines,
            {
                level: zone.level,
                color: zone.color,
            }
        ]
    }, []);
}

function renderControlChart(element, data, settings, width, height) {
    // If there is zone data from query use that. Otherwise use the settings zones
    const zones = (data[0] && data[0].zones) ? parseZonesFromQuery(data[0].zones) : settings['control.zones'];
    // The length of the data array is the number of series
    const xScale = getXScale(data.length, width);
    const chart = d3.select(element)
                    .append('svg')
                    .attr('viewBox', [0,0,width,height])
                    .attr('class', 'chassi-control-chart');

    const showXAxisLabel = settings['graph.x_axis.labels_enabled'];
    const xAxis = getXAxis(xScale, data, height, width, showXAxisLabel && settings['graph.x_axis.title_text']);
    chart.call(xAxis);

    const yRange = getYRange(data);
    const yScale = getYScale(yRange, height);
    const lines = getLines(data, xScale, yScale);
    const zoneRects = getZoneRects(zones, xScale, yScale, data.length);
    const zoneLines = getZoneLinePositions(zones);

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
        .data(zoneLines || [])
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
            .attr('stroke-width', 4)
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
    const yAxis = getYAxis(yScale, width,);

    chart.call(yAxis);

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

function buildChartData(columnValues, xKey, yKey, zonesKey) {
    if (!xKey || !yKey) { return []; }
    const xValues = columnValues[xKey];
    return xValues.reduce( (data, xValue, index) => {
        return [
            ...data,
            {
                x: xValue,
                value: columnValues[yKey][index],
                index,
                zones: columnValues[zonesKey] ? columnValues[zonesKey][index] : null,
            }
        ]
    }, []);
}

export default function controlChartRenderer(element: Element, props: SankeyProps, ) {
    const { width, height, data, settings } = props;
    const columnValues = data.cols.reduce( (colVals, col, index) => {
        const values = data.rows.map( row => row[index]);
        return {
            ...colVals,
            [col.name]: values,
        }
    },{});

    const xKey = settings['graph.dimensions'][0] || 'x';
    const yKey = settings['graph.metrics'][0] || 'y';
    const zonesKey = settings['graph.zones'][0] || '';
    const chartData = buildChartData(columnValues, xKey, yKey, zonesKey);

    renderControlChart(element, chartData, settings, width, height);
}