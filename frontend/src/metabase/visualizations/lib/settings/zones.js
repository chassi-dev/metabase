import { t } from "ttag";

export const ZONE_SETTINGS = {
    "graph.zones": {
        section: t`Zones`,
        widget: "zones",
        getProps: () => {
            return {
                addAnother: t`Add another zone...`,
            };
        },
        getDefault: (series, vizSettings) => {
            console.warn('series', series);
            return [];
        },
    }
}