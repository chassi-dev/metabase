import SankeyChart from "../components/SankeyChart.jsx";/* @flow weak */

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

function sankeyRenderer(element: Element, props: SankeyProps, ): DeregisterFunction {
    const { width, height, data } = props;
    console.warn('props', props);
    checkSeriesIsValid(props);

    // HOLDS THE WARNINGS FROUND IN DATA
    const warnings = {};
    // CALLBACK FUNCTION TO SET WARNINGS FOUND
    const warn = ({ key, text }) => {
      warnings[key] = warnings[key] || text;
    };

    // PARSES THE SERIES DATA (props.series.map( ({data}) => ...)).
    let datas = getDatas(props, warn);
    let xAxisProps = getXAxisProps(props, datas, warn);

    datas = fillMissingValuesInDatas(props, xAxisProps, datas);
    xAxisProps = getXAxisProps(props, datas, warn);

    const {
      dimension,
      groups,
      yExtents,
    } = getDimensionsAndGroupsAndUpdateSeriesDisplayNames(props, datas, warn);

    const yAxisProps = getYAxisProps(props, yExtents, datas);
    // const parent = dc.compositeChart(parentElement);
    // console.warn('parent', parent);
    // parent.render = () => {
    //     renderSandkey(element, testData, width, height);
    // }
    // initChart(parent, element);

    // parent.props = props;
    // parent.settings = props.settings;
    // parent.series = props.series;

    // const charts = dc.barChart(parent);
    // parent.compose(charts);
    // parent.render();
    renderSandkey(element, testData, width, height);
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

export default class Sankey extends SankeyChart {
    static uiName = `Sankey`;
    static identifier = "sankey";
    static iconName = "sankey";
    // UKNOWN WHAT noun IS USED FOR
    static noun = `Sankey chart`;

    static settings = {
        // Sets the data used by the axiseds. MANDATOR
        ...GRAPH_DATA_SETTINGS,
        // Next 3 settings are under the display tab.
        // ...LINE_SETTINGS,
        // ...GRAPH_GOAL_SETTINGS,
        // ...GRAPH_COLORS_SETTINGS,
        // Covers the AXIS TAB and LABEL TAB
        // ...GRAPH_AXIS_SETTINGS,
    };

    static renderer = sankeyRenderer;
}

function getColorSelector(total) {
  // const colorScale = d3.scale.ordinal(d3.schemeCategory10);
  // need to save based on a name
  const startColor = d3.rgb(144,144,224).toString();
  const endColor = d3.rgb(48,48,144).toString();
  const colorScale = d3.scale.linear().domain([0,total-1]).range([startColor, endColor]);
  return (index, darker) => {
      let hexColor = colorScale(index);
      if (darker) { hexColor = d3.rgb(hexColor).darker(3).toString(); }
      return hexColor;
  }
}

function getPath(link) {
    if (link.circular) { return link.path; }
    const path = sankeyLinkHorizontal()
            .source( d => [d.source.x1, d.y0])
            .target( d => [d.target.x0, d.y1])
    return path(link);
}

const MARGIN_LEFT = 25;
const MARGIN_RIGHT = 25;
const MARGIN_TOP = 25;
const MARGIN_BOTTOM = 75;

function renderSandkey(element, sankeyData, width, height) {
    const { nodes, links } = sankeyCircular()
        .nodeAlign(sankeyJustify)
        .nodeWidth(15)
        .nodePadding(10)
        .extent([[0,0],[width,height]])(sankeyData);

    const getColor = getColorSelector(sankeyData.nodes.length);

    const chart = d3.select(element).append('svg').attr('viewBox', [-MARGIN_LEFT,-MARGIN_TOP,width+MARGIN_RIGHT+MARGIN_LEFT,height+MARGIN_BOTTOM+MARGIN_TOP]);
    // Draw the nodes
    chart.append('g').attr('stroke','none')
        .selectAll('rect')
        .data(nodes)
        .enter().append('rect')
            .attr('x', d => d.x0)
            .attr('y', d => d.y0)
            .attr('height', d => d.y1-d.y0)
            .attr('width', d => d.x1-d.x0)
            .attr('fill', (d,i) => getColor(i))
            .attr('stroke', (d,i) => getColor(i, true))
        .append('title')
            .text(d => `${d.name} - ${d.value}`);

    // Draw the names links
    const link = chart.append('g').attr('fill','none')
        .selectAll('g')
        .data(links)
        .enter().append('g')
            .style('mix-blend-mode','multiply');

    link.append('path').attr('d', getPath)
        .attr('stroke', d => d.circular ? colors['saturated-red'] : d3.rgb(colors.white).darker(1).toString())
        .attr('stroke-opacity', 0.5)
        .attr('stroke-width', d => Math.max(2,d.width));

    link.append('title').text(d => `${d.source.name} - ${d.target.name}: ${d.value}` );

    // Node names
    chart.append('g').style('font', '1.2vmin sans-serif')
        .selectAll('text')
        .data(nodes)
        .enter().append('text')
            .attr("x", d => {
                if (d.x0 < MARGIN_LEFT) { return d.x0; }
                if (d.x0 > width - MARGIN_RIGHT) { return d.x1; }
                return (d.x0 + d.x1) / 2;
            })
            .attr("y", d => d.y0 - 10)
            .attr("dy", "0.35em")
            .attr("text-anchor", d => {
                if (d.x0 < MARGIN_LEFT) { return 'start'; }
                if (d.x0 > width - MARGIN_RIGHT) { return 'end'; }
                return 'middle';
            })
            .text(d => d.name);

    // Link info
    chart.append('g').style('font', '1.2vmin sans-serif')
        .selectAll('text')
        .data(links)
        .enter().append('text')
            .attr('x', d => d.source.x1 + 5)
            .attr('y', d => d.y0)
            .attr("dy", "0.35em")
            .attr('text-anchor', 'start')
            .text((d) => {
                const percent = `${d3.format('.0%')(d.value/d.source.value)}`;
                return `${d.value} (${percent})`;
            });
}

// TEST DATA ONLY
const testData = {
    nodes: [
        {
            name: 'Ready',
        },
        {
            name: 'Active',
        },
        {
            name: 'Exploring',
        },
        {
            name: 'Paused',
        },
        {
            name: 'At-Risk',
        },
        {
            name: 'Abandoned',
        },
        {
            name: 'Completed',
        },
    ],
    links: [
        {
            source:0,
            target:1,
            value:50,
        },
        {
            source:0,
            target:2,
            value:150,
        },
        {
            source:1,
            target:6,
            value:100,
        },
        {
            source:1,
            target:5,
            value:50,
        },
        {
            source:1,
            target:3,
            value:35,
        },
        {
            source:2,
            target:1,
            value:40,
        },
        {
            source:2,
            target:5,
            value:90,
        },
        {
            source:1,
            target:4,
            value:25,
        },
        {
            source:2,
            target:4,
            value:20,
        },
        {
            source:4,
            target:5,
            value:10,
        },
        {
            source:4,
            target:6,
            value:35,
        },
        {
            source:4,
            target:1,
            value:50,
        },
    ]
};