/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";
import CardRenderer from "./CardRenderer";
import LegendHeader from "./LegendHeader";
import { TitleLegendHeader } from "./TitleLegendHeader";

import "./LineAreaBarChart.css";
import './ControlChart.css';

import {
  isNumeric,
  isDate,
  isDimension,
  isMetric,
} from "metabase/lib/schema_metadata";
import { MAX_SERIES } from "metabase/visualizations/lib/utils";

import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

import _ from "underscore";
import cx from "classnames";

import type { VisualizationProps } from "metabase/meta/types/Visualization";

export default class ControlChart extends Component {
  props: VisualizationProps;

  static identifier: string;
  static renderer: (element: Element, props: VisualizationProps) => any;

  static noHeader = true;
  static supportsSeries = true;

  static minSize = { width: 4, height: 3 };

  static isSensible({ cols, rows }) {
    return (
      rows.length > 1 &&
      cols.length >= 2 &&
      cols.filter(isDimension).length > 0 &&
      cols.filter(isMetric).length > 0
    );
  }

  static isLiveResizable(series) {
    const totalRows = series.reduce((sum, s) => sum + s.data.rows.length, 0);
    return totalRows < 10;
  }

  static checkRenderable(series, settings) {
      console.warn('TODO: update CONTROL CHART checkRenderable');
  }

  static seriesAreCompatible(initialSeries, newSeries) {
    const initialSettings = getComputedSettingsForSeries([initialSeries]);
    const newSettings = getComputedSettingsForSeries([newSeries]);

    const initialDimensions = getColumnsFromNames(
      initialSeries.data.cols,
      initialSettings["graph.dimensions"],
    );
    const newDimensions = getColumnsFromNames(
      newSeries.data.cols,
      newSettings["graph.dimensions"],
    );
    const newMetrics = getColumnsFromNames(
      newSeries.data.cols,
      newSettings["graph.metrics"],
    );

    // must have at least one dimension and one metric
    if (newDimensions.length === 0 || newMetrics.length === 0) {
      return false;
    }

    // all metrics must be numeric
    if (!_.all(newMetrics, isNumeric)) {
      return false;
    }

    // both or neither primary dimension must be dates
    if (isDate(initialDimensions[0]) !== isDate(newDimensions[0])) {
      return false;
    }

    // both or neither primary dimension must be numeric
    // a timestamp field is both date and number so don't enforce the condition if both fields are dates; see #2811
    if (
      isNumeric(initialDimensions[0]) !== isNumeric(newDimensions[0]) &&
      !(isDate(initialDimensions[0]) && isDate(newDimensions[0]))
    ) {
      return false;
    }

    return true;
  }

  static placeholderSeries = [
    {
      card: {
        display: "line",
        visualization_settings: {},
        dataset_query: { type: "null" },
      },
      data: {
        rows: _.range(0, 11).map(i => [i, i]),
        cols: [
          { name: "x", base_type: "type/Integer" },
          { name: "y", base_type: "type/Integer" },
        ],
      },
    },
  ];

  static propTypes = {
    series: PropTypes.array.isRequired,
    actionButtons: PropTypes.node,
    showTitle: PropTypes.bool,
    isDashboard: PropTypes.bool,
  };

  static defaultProps = {};

  getFidelity() {
    const fidelity = { x: 0, y: 0 };
    const size = this.props.gridSize || { width: Infinity, height: Infinity };
    if (size.width >= 5) {
      fidelity.x = 2;
    } else if (size.width >= 4) {
      fidelity.x = 1;
    }
    if (size.height >= 5) {
      fidelity.y = 2;
    } else if (size.height >= 4) {
      fidelity.y = 1;
    }

    return fidelity;
  }

  getSettings() {
    const fidelity = this.getFidelity();

    const settings = { ...this.props.settings };

    // smooth interpolation at smallest x/y fidelity
    if (fidelity.x === 0 && fidelity.y === 0) {
      settings["line.interpolate"] = "cardinal";
    }

    // no axis in < 1 fidelity
    if (fidelity.x < 1 || fidelity.y < 1) {
      settings["graph.y_axis.axis_enabled"] = false;
    }

    // no labels in < 2 fidelity
    if (fidelity.x < 2 || fidelity.y < 2) {
      settings["graph.y_axis.labels_enabled"] = false;
    }

    return settings;
  }

  render() {
    const {
      series,
      hovered,
      showTitle,
      actionButtons,
      onChangeCardAndRun,
      onVisualizationClick,
      visualizationIsClickable,
      onAddSeries,
      onEditSeries,
      onRemoveSeries,
    } = this.props;

    const settings = this.getSettings();

    let multiseriesHeaderSeries;
    if (series.length > 1 || onAddSeries || onEditSeries || onRemoveSeries) {
      multiseriesHeaderSeries = series;
    }

    const hasTitle = showTitle && settings["card.title"];

    return (
      <div
        className={cx(
          "ControlChart flex flex-column p1",
          this.props.className,
        )}
      >
        {hasTitle && (
          <TitleLegendHeader
            series={series}
            settings={settings}
            onChangeCardAndRun={onChangeCardAndRun}
            actionButtons={actionButtons}
          />
        )}
        {multiseriesHeaderSeries || (!hasTitle && actionButtons) ? ( // always show action buttons if we have them
          <LegendHeader
            className="flex-no-shrink"
            series={multiseriesHeaderSeries}
            settings={settings}
            hovered={hovered}
            onHoverChange={this.props.onHoverChange}
            actionButtons={!hasTitle ? actionButtons : null}
            onChangeCardAndRun={onChangeCardAndRun}
            onVisualizationClick={onVisualizationClick}
            visualizationIsClickable={visualizationIsClickable}
            onAddSeries={onAddSeries}
            onEditSeries={onEditSeries}
            onRemoveSeries={onRemoveSeries}
          />
        ) : null}
        <CardRenderer
          {...this.props}
          series={series}
          settings={settings}
          className="renderer flex-full"
          maxSeries={MAX_SERIES}
          renderer={this.constructor.renderer}
        />
      </div>
    );
  }
}

function getColumnsFromNames(cols, names) {
  if (!names) {
    return [];
  }
  return names.map(name => _.findWhere(cols, { name }));
}