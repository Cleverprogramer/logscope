import { symbol } from "../symbols.js";

/** Small static banner kept narrow and screen-reader friendly. */
export function bannerLines(): string[] {
  return [
    "  _                 _                                      ",
    `${symbol("⌁", "~")} logscope  terminal log analysis & observability toolkit`,
  ];
}
