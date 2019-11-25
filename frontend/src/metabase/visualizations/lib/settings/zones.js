import { t } from "ttag";

export const ZONE_SETTINGS = {
    "graph.zones": {
        section: t`Zones`,
        widget: "zones",
        getProps: (a, vizSettings) => {
            return {
                addAnother: t`Add another zone...`,
            };
        }
    }
}