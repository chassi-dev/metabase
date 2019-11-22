import { t } from "ttag";

export const ZONE_SETTINGS = {
    "graph.zones": {
        section: t`Zones`,
        title: t`zones`,
        widget: "fields",
        getProps: (a, vizSettings) => {
            console.warn('a',a);
            console.warn('vis',vizSettings);
            
        }
    }
}