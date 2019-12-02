import React from "react";
import d3 from 'd3';
import cx from "classnames";
import Icon from "metabase/components/Icon";

import ColorPicker from "metabase/components/ColorPicker";
import ChartSettingInput from './ChartSettingInput';

function getColorSelector(r, g, b, total) {
  const startColor = d3.rgb(r,g,b).toString();
  const endColor = d3.rgb(startColor).brighter(total).toString();
  const colorScale = d3.scale.linear().domain([0,total-1]).range([startColor, endColor]);
  return (index) => {
      return colorScale(index);
  }
}

function getColors() {
    const greenSelector = getColorSelector(25, 150, 0, 3);
    const yellowSelector = getColorSelector(245, 195, 0, 3);
    const redSelector = getColorSelector(207, 57, 53, 3);
    return [
        greenSelector(0),
        greenSelector(1),
        greenSelector(2),
        yellowSelector(0),
        yellowSelector(1),
        yellowSelector(2),
        redSelector(0),
        redSelector(1),
        redSelector(2),
    ]
}

class ChartSettingZone extends React.Component {
    constructor(props) {
        super(props);

        this.colors = getColors();
        const { zone } = props;
        this.state = {
            color: zone.color || this.colors[0],
            upperLimit: zone.range[0] || '',
            lowerLimit: zone.range[1] || '',
            level: zone.level || '',
        }

    }

    componentWillReceiveProps(nextProps) {
        const { zone: { color, range, level } } = this.props;
        const { zone } = nextProps;

        if (zone.color !== color) { this.setState({color: zone.color}); }
        if (zone.level !== level) { this.setState({level: zone.level}); }
        if (zone.range[0] !== range[0]) { this.setState({upperLimit: zone.range[0]}); }
        if (zone.range[1] !== range[1]) { this.setState({lowerLimit: zone.range[1]}); }
    }

    colorChange = color => {
        this.setState({color}, this.handleChange);
    }

    upperLimitChange = upperLimit => {
        this.setState({upperLimit}, this.handleChange);
    }

    lowerLimitChange = lowerLimit => {
        this.setState({lowerLimit}, this.handleChange);
    }

    levelChange = level => {
        this.setState({level}, this.handleChange);
    }

    handleChange = () => {
        const { color, upperLimit, lowerLimit, level } = this.state;
        // Need color AND EITHER the zone range OR line level
        if (!!color && ((!!upperLimit && !!lowerLimit) || !!level)) {
            this.props.onChange({
                color,
                level,
                range: [upperLimit, lowerLimit],
            })
        }
    }

    render() {
        const {
            className,
            title,
            onRemove,
            index
        } = this.props;

        const { color, upperLimit, lowerLimit, level } = this.state;

        return (
            <div className={cx(className, "align-center")}>
                <div style={{paddingBottom: '7px', display: 'flex', flexDirection: 'row'}}>
                    <h4>{title}</h4>
                    <Icon
                      name="close"
                      className={cx("ml1 text-medium text-brand-hover cursor-pointer", {
                        "disabled hidden": !onRemove || index === 0,
                      })}
                      onClick={onRemove}
                    />
                </div>
                <div style={{paddingBottom: '7px'}}>
                    <div style={{marginRight: '7px'}}>
                        <ColorPicker
                          colors={this.colors}
                          onChange={this.colorChange}
                          size={32}
                          value={color}
                        />
                    </div>
                </div>
                <div style={{display: 'flex', flexDirection: 'row'}}>
                    <div style={{paddingBottom: '7px', marginRight:'6px', display: 'flex', flexDirection: 'column'}}>
                        <h4>Line:</h4>
                        <ChartSettingInput
                            type={'number'}
                            placeholder={'Level'}
                            onChange={this.levelChange}
                            value={level}
                            style={{flexBasis: 'auto'}}
                        />
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column', paddingLeft: '6px', borderLeft: '1px solid #c3c3c3'}}>
                        <h4>Range:</h4>
                        <div style={{display: 'flex', flexDirection: 'row'}}>
                            <div style={{marginRight: '6px'}} >
                                <ChartSettingInput
                                    type={'number'}
                                    placeholder={'Upper Limit'}
                                    onChange={this.upperLimitChange}
                                    value={upperLimit}
                                />
                            </div>
                            <div>
                                <ChartSettingInput
                                    type={'number'}
                                    placeholder={'Lower Limit'}
                                    onChange={this.lowerLimitChange}
                                    value={lowerLimit}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

ChartSettingZone.defaultProps = {
    zone: {
        color: '',
        level: '',
        range: ['',''],
    }
}

export default ChartSettingZone;
