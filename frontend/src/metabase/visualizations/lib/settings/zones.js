import { t } from "ttag";

export const ZONE_SETTINGS = {
    "graph.zones": {
        section: t`Zones`,
        widget: "zones",
        getProps: (a, settings) => {
            console.warn('settings',settings)
            return {
                addAnother: t`Add another zone...`,
                zones: settings['graph.zones'],
            };
        },
        getDefault: () => [],
    }
}