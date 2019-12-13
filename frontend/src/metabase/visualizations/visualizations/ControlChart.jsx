import ControlChart from "../components/ControlChart.jsx";/* @flow weak */
import controlChartRenderer from '../lib/ControlChartRenderer';

import { ZONE_SETTINGS } from '../lib/settings/zones';

export default class Control extends ControlChart {
    static uiName = `Control`;
    static identifier = "control";
    static iconName = "control";

    static settings = {
        ...ZONE_SETTINGS,
    };

    static renderer = controlChartRenderer;
}
