import { AdminForthPlugin } from "adminforth";
import type { IAdminForth, AdminForthResource } from "adminforth";
import type { PluginOptions } from "./types.js";

export default class I18nStaticPlugin extends AdminForthPlugin {
  options: PluginOptions;

  constructor(options: PluginOptions) {
    super(options, import.meta.url);
    this.options = options;
  }

  async modifyResourceConfig(adminforth: IAdminForth, resourceConfig: AdminForthResource) {
    super.modifyResourceConfig(adminforth, resourceConfig);
  }

  instanceUniqueRepresentation(): string {
    return 'single';
  }
}
