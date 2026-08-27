export type EvalRunDispatchItem = {
  id: string;
  pipelineName: string;
  datasetItemId: string;
};

export function groupEvalRunDispatchItemsByDatasetFile(
  datasetItemIds: string[],
  items: EvalRunDispatchItem[],
): EvalRunDispatchItem[][] {
  return datasetItemIds
    .map((datasetItemId) => items.filter((item) => item.datasetItemId === datasetItemId))
    .filter((batch) => batch.length > 0);
}
