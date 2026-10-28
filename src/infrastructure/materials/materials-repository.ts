import {
  emptyMaterialsState,
  type MaterialsState,
} from "@/domain/materials/types";
import { parseMaterialsState } from "@/domain/materials/state";
import { assertLocalWritesAllowed } from "./purge-signal";
export {
  parseMaterialsState,
  addDocument,
  addImportBatch,
  mergeMaterials,
} from "@/domain/materials/state";
export const MATERIALS_STORAGE_KEY = "lexis.materials.v1";
const MAX_SERIALIZED = 20_000_000;

export class MaterialsRepository {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem">) {}
  read(): { state: MaterialsState; serialized: string | null } {
    assertLocalWritesAllowed();
    const serialized = this.storage.getItem(MATERIALS_STORAGE_KEY);
    if (serialized !== null && serialized.length > MAX_SERIALIZED)
      throw new Error(
        "Saved materials exceed the supported local size. The original data has been preserved.",
      );
    return {
      serialized,
      state:
        serialized === null
          ? emptyMaterialsState()
          : parseMaterialsState(JSON.parse(serialized)),
    };
  }
  commit(state: MaterialsState, expected: string | null): string {
    assertLocalWritesAllowed();
    if (this.storage.getItem(MATERIALS_STORAGE_KEY) !== expected)
      throw new Error(
        "Your materials changed in another tab. Reload before saving; your current input is still here.",
      );
    const serialized = JSON.stringify(parseMaterialsState(state));
    if (serialized.length > MAX_SERIALIZED)
      throw new Error(
        "Your materials exceed this local storage limit. Export a backup before removing material.",
      );
    this.storage.setItem(MATERIALS_STORAGE_KEY, serialized);
    return serialized;
  }
}
