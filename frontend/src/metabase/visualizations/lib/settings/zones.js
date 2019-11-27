import { t } from "ttag";
import { getOptionFromColumn } from "metabase/visualizations/lib/settings/utils";
import {
  isDimension,
  isMetric,
} from "metabase/lib/schema_metadata";

import { getFriendlyName } from "metabase/visualizations/lib/utils";

export const ZONE_SETTINGS = {
    "graph.zones": {
        section: t`Zones`,
        widget: "zones",
        getProps: (a, settings) => {
            return {
                addAnother: t`Add another zone...`,
                zones: settings['graph.zones'],
            };
        },
        getDefault: () => [],
    },
    "graph.dimensions": {
        section: t`Data`,
        title: t`X-axis`,
        widget: "fields",
        getDefault: () => [null],
        persistDefault: true,
        getProps: ([{ card, data }], vizSettings) => {
            const value = vizSettings["graph.dimensions"];
            const options = data.cols
                                .filter(isDimension)
                                .map(getOptionFromColumn);
            return {
                options,
                columns: data.cols,
            };
        },
        writeDependencies: ["graph.metrics"],
        dashboard: false,
        useRawSeries: true,
    },
    "graph.metrics": {
        section: t`Data`,
        title: t`Y-axis`,
        widget: "fields",
        getDefault: () => [null],
        persistDefault: true,
        getProps: ([{ card, data }], vizSettings) => {
            const value = vizSettings["graph.dimensions"];
            const options = data.cols
                                .filter(isMetric)
                                .map(getOptionFromColumn);
            return {
                options,
                columns: data.cols,
            };
        },
        useRawSeries: true,
    },
    "graph.x_axis.labels_enabled": {
        section: t`Labels`,
        title: t`Show label on x-axis`,
        widget: "toggle",
        default: true,
    },
    "graph.x_axis.title_text": {
        section: t`Labels`,
        title: t`X-axis label`,
        widget: "input",
        getHidden: (series, vizSettings) =>
            vizSettings["graph.x_axis.labels_enabled"] === false,
        getDefault: ([{data}], vizSettings) => {
            const { cols } = data;
            const col = cols.find( c => c.name === vizSettings['graph.dimensions'][0]);
            return col ? col.display_name : '';
        }
    },
    "graph.y_axis.labels_enabled": {
        section: t`Labels`,
        title: t`Show label on y-axis`,
        widget: "toggle",
        default: true,
    },
    "graph.y_axis.title_text": {
        section: t`Labels`,
        title: t`Y-axis label`,
        widget: "input",
        getHidden: (series, vizSettings) =>
            vizSettings["graph.y_axis.labels_enabled"] === false,
        getDefault: ([{data}], vizSettings) => {
            const { cols } = data;
            const col = cols.find( c => c.name === vizSettings['graph.metrics'][0]);
            return col ? col.display_name : '';
        }
    },
}