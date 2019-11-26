import ControlChart from "../components/ControlChart.jsx";/* @flow weak */

import crossfilter from "crossfilter";
import d3 from "d3";
import dc from "dc";
import _ from "underscore";
import { assocIn, updateIn } from "icepick";
import { t } from "ttag";
import { lighten } from "metabase/lib/colors";

import Question from "metabase-lib/lib/Question";

import {
  computeSplit,
  computeMaxDecimalsForValues,
  getFriendlyName,
  colorShades,
} from "../lib/utils";

import {
  minTimeseriesUnit,
  computeTimeseriesDataInverval,
  getTimezone,
} from "../lib/timeseries";

import { computeNumericDataInverval } from "../lib/numeric";

import {
  applyChartTimeseriesXAxis,
  applyChartQuantitativeXAxis,
  applyChartOrdinalXAxis,
  applyChartYAxis,
} from "../lib/apply_axis";

import { setupTooltips } from "../lib/apply_tooltips";
import { getTrendDataPointsFromInsight } from "../lib/trends";

import fillMissingValuesInDatas from "../lib/fill_data";
import { NULL_DIMENSION_WARNING, unaggregatedDataWarning } from "../lib/warnings";

import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";

import {
  forceSortedGroupsOfGroups,
  initChart, // TODO - probably better named something like `initChartParent`
  makeIndexMap,
  reduceGroup,
  isTimeseries,
  isQuantitative,
  isHistogram,
  isOrdinal,
  isHistogramBar,
  isStacked,
  isNormalized,
  getDatas,
  getFirstNonEmptySeries,
  getXValues,
  isDimensionTimeseries,
  isRemappedToString,
  isMultiCardSeries,
} from "../lib/renderer_utils";

import lineAndBarOnRender from "../lib/LineAreaBarPostRender";

import { isStructured } from "metabase/meta/Card";

import {
  updateDateTimeFilter,
  updateNumericFilter,
} from "metabase/modes/lib/actions";

import { lineAddons } from "../lib/graph/addons";
import { initBrush } from "../lib/graph/brush";

import type { VisualizationProps } from "metabase/meta/types/Visualization";
import { sankeyLinkHorizontal } from 'd3-sankey';
import { sankeyCircular, sankeyJustify } from 'd3-sankey-circular';
import colors from '../../lib/colors';
import { getAvailableCanvasWidth, getAvailableCanvasHeight } from "../lib/utils";

type SankeyProps = { //VisualizationProps & {
  chartType: "sankey",
  isScalarSeries: boolean,
  maxSeries: number,
};

type DeregisterFunction = () => void;

function checkSeriesIsValid({ series, maxSeries }) {
  return true;
  // if (getFirstNonEmptySeries(series).data.cols.length < 2) {
  //   throw new Error(t`This chart type requires at least 2 columns.`);
  // }
  //
  // if (series.length > maxSeries) {
  //   throw new Error(
  //     t`This chart type doesn't support more than ${maxSeries} series of data.`,
  //   );
  // }
}

function getXAxisProps(props, datas, warn) {
  const rawXValues = getXValues(props);
  const isHistogram = false; //isHistogramBar(props);
  const xInterval = getXInterval(props, rawXValues, warn);

  // For histograms we add a fake x value one xInterval to the right
  // This compensates for the barshifting we do align ticks
  const xValues = isHistogram
    ? [...rawXValues, Math.max(...rawXValues) + xInterval]
    : rawXValues;
  return {
    isHistogramBar: isHistogram,
    xDomain: d3.extent(xValues),
    xInterval,
    xValues,
  };
}

function getXInterval({ settings, series }, xValues, warn) {
  if (isTimeseries(settings)) {
    // We need three pieces of information to define a timeseries range:
    // 1. interval - it's really the "unit": month, day, etc
    // 2. count - how many intervals per tick?
    // 3. timezone - what timezone are values in? days vary in length by timezone
    const unit = minTimeseriesUnit(series.map(s => s.data.cols[0].unit));
    const timezone = getTimezone(series, warn);
    const { count, interval } = computeTimeseriesDataInverval(xValues, unit);
    return { count, interval, timezone };
  } else if (isQuantitative(settings)) {
    // Get the bin width from binning_info, if available
    // TODO: multiseries?
    const binningInfo = getFirstNonEmptySeries(series).data.cols[0]
      .binning_info;
    if (binningInfo) {
      return binningInfo.bin_width;
    }

    // Otherwise try to infer from the X values
    return computeNumericDataInverval(xValues);
  }
}

function getDimensionsAndGroupsAndUpdateSeriesDisplayNames(
  props,
  datas,
  warn,
) {
  const { settings, chartType } = props;
  const { groups, dimension } =
    chartType === "scatter"
      ? getDimensionsAndGroupsForScatterChart(datas)
      : isStacked(settings, datas)
      ? getDimensionsAndGroupsAndUpdateSeriesDisplayNamesForStackedChart(
          props,
          datas,
          warn,
        )
      : getDimensionsAndGroupsForOther(props, datas, warn);
  const yExtents = getYExtentsForGroups(groups);
  return { groups, dimension, yExtents };
}

function getDimensionsAndGroupsAndUpdateSeriesDisplayNamesForStackedChart() {
    console.warn('getDimensionsAndGroupsAndUpdateSeriesDisplayNamesForStackedChart SHOULDN"T BE HERE');
}

function getDimensionsAndGroupsForScatterChart() {
    console.warn('getDimensionsAndGroupsForScatterChart SHOULD NOT BE HERE')
}

function getDimensionsAndGroupsForOther({ series }, datas, warn) {
  const dataset = crossfilter();
  datas.map(data => dataset.add(data));

  const dimension = dataset.dimension(d => d[0]);
  const groups = datas.map((data, seriesIndex) => {
    // If the value is empty, pass a dummy array to crossfilter
    data = data.length > 0 ? data : [[null, null]];

    const dim = crossfilter(data).dimension(d => d[0]);

    return data[0]
      .slice(1)
      .map((_, metricIndex) =>
        reduceGroup(dim.group(), metricIndex + 1, () =>
          warn(unaggregatedDataWarning(series[seriesIndex].data.cols[0])),
        ),
      );
  });

  return { dimension, groups };
}

function getYExtentsForGroups(groups) {
  return groups.map(group => {
    const sums = new Map();
    for (const g of group) {
      for (const { key, value } of g.all()) {
        const prevValue = sums.get(key) || 0;
        sums.set(key, prevValue + value);
      }
    }
    return d3.extent(Array.from(sums.values()));
  });
}

function getYAxisProps(props, yExtents, datas) {
  const yAxisSplit = getYAxisSplit(props, datas, yExtents);

  const [yLeftSplit, yRightSplit] = getYAxisSplitLeftAndRight(
    props.series,
    yAxisSplit,
    yExtents,
  );

  return {
    yExtents,
    yAxisSplit,
    yExtent: d3.extent([].concat(...yExtents)),
    yLeftSplit,
    yRightSplit,
    isSplit: getIsSplitYAxis(yLeftSplit, yRightSplit),
  };
}

function getIsSplitYAxis(left, right) {
  return right && right.series.length && (left && left.series.length > 0);
}

function getYAxisSplit(
  { settings, chartType, isScalarSeries, series },
  datas,
  yExtents,
) {
  const seriesAxis = series.map(single => settings.series(single)["axis"]);
  const left = [];
  const right = [];
  const auto = [];
  for (const [index, axis] of seriesAxis.entries()) {
    if (axis === "left") {
      left.push(index);
    } else if (axis === "right") {
      right.push(index);
    } else {
      auto.push(index);
    }
  }

  // don't auto-split if the metric columns are all identical, i.e. it's a breakout multiseries
  const hasDifferentYAxisColumns =
    _.uniq(series.map(s => JSON.stringify(s.data.cols[1]))).length > 1;
  if (
    !isScalarSeries &&
    chartType !== "scatter" &&
    !isStacked(settings, datas) &&
    hasDifferentYAxisColumns &&
    settings["graph.y_axis.auto_split"] !== false
  ) {
    // NOTE: this version computes the split after assigning fixed left/right
    // which causes other series to move around when changing the setting
    // return computeSplit(yExtents, left, right);

    // NOTE: this version computes a split with all axis unassigned, then moves
    // assigned ones to their correct axis
    const [autoLeft, autoRight] = computeSplit(yExtents);
    return [
      _.uniq([...left, ...autoLeft.filter(index => !seriesAxis[index])]),
      _.uniq([...right, ...autoRight.filter(index => !seriesAxis[index])]),
    ];
  } else {
    // assign all auto to the left
    return [[...left, ...auto], right];
  }
}

function getYAxisSplitLeftAndRight(series, yAxisSplit, yExtents) {
  return yAxisSplit.map(indexes => ({
    series: indexes.map(index => series[index]),
    extent: d3.extent([].concat(...indexes.map(index => yExtents[index]))),
  }));
}



// ABOVE IS ALL METABASE STUFF KEPT JUST TO NOT BREAK THE WORLD AND FOR REFERENCE
//
// BELOW IS WHAT WE NEED TO RUN OUR CHART

// THIS FUNCTION HAS A LOT OF METABASE STUFF MUCH MAY BE AB TO BE PULLED OUT
function controlChartRenderer(element: Element, props: SankeyProps, ): DeregisterFunction {
    const { width, height, data, settings } = props;
    console.warn('props', props);

    /*
    /   THIS SECTION USES METABASE CODE ABOVE
    */
    // checkSeriesIsValid(props);
    //
    // // HOLDS THE WARNINGS FROUND IN DATA
    // const warnings = {};
    // // CALLBACK FUNCTION TO SET WARNINGS FOUND
    // const warn = ({ key, text }) => {
    //   warnings[key] = warnings[key] || text;
    // };
    //
    // // PARSES THE SERIES DATA (props.series.map( ({data}) => ...)).
    // let datas = getDatas(props, warn);
    // let xAxisProps = getXAxisProps(props, datas, warn);
    //
    // datas = fillMissingValuesInDatas(props, xAxisProps, datas);
    // xAxisProps = getXAxisProps(props, datas, warn);
    //
    // const {
    //   dimension,
    //   groups,
    //   yExtents,
    // } = getDimensionsAndGroupsAndUpdateSeriesDisplayNames(props, datas, warn);
    //
    // const yAxisProps = getYAxisProps(props, yExtents, datas);

    /*
    / THIS IS FOR RENDERING WITH DC. WE ARE NOT DOING THAT RIGHT NOW
    */
    // const parent = dc.compositeChart(parentElement);
    // console.warn('parent', parent);
    // parent.render = () => {
    //     renderControlChart(element, testData, width, height);
    // }
    // initChart(parent, element);

    // parent.props = props;
    // parent.settings = props.settings;
    // parent.series = props.series;

    // const charts = dc.barChart(parent);
    // parent.compose(charts);
    // parent.render();

    renderControlChart(element, testData, settings['graph.zones'], width, height);
    return () => {
      // dc.chartRegistry.deregister(parent);
    };
}

import {
  GRAPH_DATA_SETTINGS,
  LINE_SETTINGS,
  GRAPH_GOAL_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_AXIS_SETTINGS,
} from "../lib/settings/graph";

import { ZONE_SETTINGS } from '../lib/settings/zones';

console.warn('zone settings', ZONE_SETTINGS);

export default class Control extends ControlChart {
    static uiName = `Control`;
    static identifier = "control";
    static iconName = "control";
    // UKNOWN WHAT noun IS USED FOR
    static noun = `Control chart`;

    static settings = {
        // Sets the data used by the axiseds. MANDATOR
        ...ZONE_SETTINGS,
        ...GRAPH_DATA_SETTINGS,
        // Next 3 settings are under the display tab.
        // ...LINE_SETTINGS,
        // ...GRAPH_GOAL_SETTINGS,
        // ...GRAPH_COLORS_SETTINGS,
        // Covers the AXIS TAB and LABEL TAB
        // ...GRAPH_AXIS_SETTINGS,
    };

    static renderer = controlChartRenderer;
}

const WIDTH = 950;
const HEIGHT = 600;
const MARGIN_BOTTOM = 100;
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 25;
const MARGIN_TOP = 10;

const DATA_BUFFER_PCT = 10;

const getXScale = count => {
    return d3.scale.linear()
        .domain([0, count])
        .range([MARGIN_LEFT, WIDTH - MARGIN_RIGHT]);
}

const getYScale = (yRange, bufferPct = DATA_BUFFER_PCT) => {
    const {max, min} = yRange;
    const buffer = (max - min) * (bufferPct/100);
    return d3.scale.linear()
        .domain([min - buffer, max +  buffer])
        .range([HEIGHT - MARGIN_BOTTOM, MARGIN_TOP]);
}

const getYRange = data => {
    return data.reduce( (range, {value}) => {
        let { max, min } = range;
        if (max < value) max = value;
        if (min > value) min = value;
        return {max, min};
    }, {max: -Infinity, min:Infinity});
}

const getXAxis = xScale => {
    return chart => {
        chart.append('g')
            .attr('transform', `translate(0,${HEIGHT - MARGIN_BOTTOM})`)
            .attr('class', 'axis x')
            .call(d3.svg.axis().scale(xScale).orient('bottom').innerTickSize(2).tickFormat( d => d ));
    }
}

const getYAxis = (yScale, side = 'left') => {
    return chart => {
        let axis = d3.svg.axis().scale(yScale)
        axis = side === 'left' ? axis.orient('left') : axis.orient('right');
        const translate = side === 'left' ? MARGIN_LEFT : WIDTH-MARGIN_RIGHT;
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
        const path = `M${xScale(prevItem.x)},${yScale(prevItem.value)}L${xScale(item.x)},${yScale(item.value)}`;
        prevItem = item;
        return [
            ...lines,
            path,
        ]
    }, []);
}

const getZoneRects = (zones = [], xScale, yScale, dataCount) => {
    return zones.reduce( (rects, zone) => {
        if (!zone.range) return rects;
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

function renderControlChart(element, data, zones, width, height) {

    // The length of the data array is the number of series
    const xScale = getXScale(data.length);
    const yRange = getYRange(data);
    const yScale = getYScale(yRange);
    const xAxis = getXAxis(xScale);
    const yAxis = getYAxis(yScale);
    const lines = getLines(data, xScale, yScale);
    const zoneRects = getZoneRects(zones, xScale, yScale, data.length);

    const chart = d3.select(element)
                    .append('svg')
                    .attr('viewBox', [0,0,WIDTH,HEIGHT])
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
        .data(zones)
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
            .attr('stroke', '#444')
            .attr('fill','none')

    // Draw points
    chart.selectAll('circle')
        .data(data)
        .enter().append('circle')
            .attr('cx', d => xScale(d.x))
            .attr('cy', d => yScale(d.value))
            .attr('r', 2)
            .attr('stroke-width', 2)
            .attr('stroke', '#4682b4')
            .attr('fill', '#ffffff')

    chart.call(xAxis);
    chart.call(yAxis);
}

// TEST DATA ONLY
const testData = [
    {
        x: 1,
        value: 100,
    },
    {
        x: 2,
        value: 125,
    },
    {
        x: 3,
        value: 75,
    },
    {
        x: 4,
        value: 120,
    },
    {
        x: 5,
        value: 40,
    },
    {
        x: 6,
        value: 75,
    },
    {
        x: 7,
        value: 110,
    },
    {
        x: 8,
        value: 60,
    },
    {
        x: 9,
        value: 155,
    },
    {
        x: 10,
        value: 95,
    },
    {
        x: 11,
        value: 100,
    },
    {
        x: 12,
        value: 125,
    },
    {
        x: 13,
        value: 75,
    },
    {
        x: 14,
        value: 120,
    },
    {
        x: 15,
        value: 40,
    },
    {
        x: 16,
        value: 75,
    },
    {
        x: 17,
        value: 110,
    },
    {
        x: 18,
        value: 60,
    },
    {
        x: 19,
        value: 150,
    },
    {
        x: 20,
        value: 95,
    },
]

const standardZones = [
    {
        // range: [null,150],
        level: 150,
        color: '#ff0400', //'#da5553',
    },
    {
        range: [150,130],
        level: 130,
        color: '#CF3935', //'#dc9493'
    },
    {
        range: [130, 110],
        level: 110,
        color: '#fde455', //'#f7ecad'
    },
    {
        range: [110,70],
        level: 90,
        color: '#7bb31f', //'#b8d090'
    },
    {
        range: [70,50],
        level: 70,
        color: '#fde455', //'#f7ecad'
    },
    {
        range: [50, 30],
        level: 50,
        color: '#CF3935', //'#dc9493'
    },
    // {
    //     level: 0,
    //     color: '#ff0400', //'#da5553'
    // },

]