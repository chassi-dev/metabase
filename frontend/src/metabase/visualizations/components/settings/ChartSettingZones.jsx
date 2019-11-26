import React from "react";
import d3 from 'd3';
import { t } from "ttag";
import cx from "classnames";

import ChartSettingZone from './ChartSettingZone';

class ChartSettingZones extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            zones: props.zones || [{range: ['','']}],
        }

    }

    handleChange = (index, data) => {
        const { zones } = this.state;
        this.setState({
            zones: [
                ...zones.slice(0,index),
                data,
                ...zones.slice(index+1),
            ]
        }, () => {
            this.props.onChange(this.state.zones);
        });
    }

    addZone = () => {
        this.setState({
            zones: [
                ...this.state.zones,
                {range: ['','']},
            ]
        });
    }

    removeZone = index => {
        const { zones } = this.state;
        this.setState({
            zones: [
                ...zones.slice(0,index),
                ...zones.slice(index+1),
            ]
        }, () => {
            this.props.onChange(this.state.zones);
        });

    }

    render() {
        const {
            addAnother,
            onChange,
            className,
            title,
        } = this.props;

        const { zones } = this.state;

        const { color, upperLimit, lowerLimit, level } = this.state;

        return (
            <div className={cx(className, "align-center")} style={{paddingBottom: '7px'}}>
                {zones.map( (zone, index) => (
                    <ChartSettingZone
                        key={index}
                        index={index}
                        title={`Zone ${index}`}
                        onChange={zoneData => this.handleChange(index, zoneData)}
                        onRemove={() => this.removeZone(index)}
                        zone={zone}
                    />
                ))}
                {addAnother && (
                  <div className="mt2 mb3">
                    <a
                      className="text-brand text-bold py1 px2 rounded bg-light bg-medium-hover"
                      onClick={this.addZone}
                    >
                      {addAnother}
                    </a>
                  </div>
                )}
            </div>
        );
    }
}

export default ChartSettingZones;
