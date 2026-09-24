export function settingsSectionPath(section: unknown) {
  const name = Array.isArray(section) ? section[0] : section;
  if (["payments", "setup", "webhooks"].includes(String(name)))
    return "/admin/system/developer";
  if (name === "brand-kit") return "/admin/settings/brand";
  return `/admin/settings/${["general", "brand", "shipping", "taxes", "email", "account", "team"].includes(String(name)) ? name : "general"}`;
}
