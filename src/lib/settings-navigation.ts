export function settingsSectionPath(section: unknown) {
  const name = Array.isArray(section) ? section[0] : section;
  if (["payments", "setup", "webhooks"].includes(String(name)))
    return "/admin/system/developer";
  if (name === "account") return "/admin/account";
  if (name === "team") return "/admin/system/team";
  if (name === "brand-kit") return "/admin/settings/brand";
  return `/admin/settings/${["general", "brand", "shipping", "taxes", "email"].includes(String(name)) ? name : "general"}`;
}
