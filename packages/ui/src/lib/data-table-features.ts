import { columnVisibilityFeature, tableFeatures } from '@tanstack/react-table';

/** The features of the app's tables: columns can be shown and hidden. */
export const dataTableFeatures = tableFeatures({ columnVisibilityFeature });
export type DataTableFeatures = typeof dataTableFeatures;
