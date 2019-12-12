/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";
import CardRenderer from "./CardRenderer";
import LegendHeader from "./LegendHeader";
import { TitleLegendHeader } from "./TitleLegendHeader";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";

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
      if (!settings['graph.dimensions'][0] || !settings['graph.metrics'][0]) throw new ChartSettingsError();
  }

  static seriesAreCompatible(initialSeries, newSeries) {
      return true;
  }

  static placeholderSeries = [
    {
      card: {
        display: "control",
        visualization_settings: {},
        dataset_query: { type: "null" },
      },
      data: {
        rows: _.range(0, 11).map(i => [i, i, '{"{\"color\": \"#199600\", \"line\": 5, \"upper\": 6, \"lower\": 4}","{\"color\": \"#fae100\", \"line\": 6, \"upper\": 8, \"lower\": 6}","{\"color\": \"#fae100\", \"line\": 4, \"upper\": 4, \"lower\": 2}","{\"color\": \"#cf3935\", \"line\": 8, \"upper\": 10, \"lower\": 8}","{\"color\": \"#cf3935\", \"line\": 2, \"upper\": 2, \"lower\": 0}"}']),
        cols: [
          { name: "x", base_type: "type/Integer" },
          { name: "y", base_type: "type/Integer" },
          { name: "control_chart_zones", base_type: 'type/Array' },
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