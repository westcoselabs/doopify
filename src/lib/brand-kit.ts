import { z } from 'zod'

export const BRAND_FONT_VALUES = [
  'system',
  'inter',
  'arial',
  'helvetica',
  'georgia',
  'times',
  'poppins',
  'montserrat',
] as const

export const BUTTON_RADIUS_VALUES = ['none', 'sm', 'md', 'lg', 'full'] as const
export const BUTTON_STYLE_VALUES = ['solid', 'outline', 'soft'] as const
export const BUTTON_TEXT_TRANSFORM_VALUES = ['normal', 'uppercase'] as const

export type BrandFontValue = (typeof BRAND_FONT_VALUES)[number]
export type ButtonRadiusValue = (typeof BUTTON_RADIUS_VALUES)[number]
export type ButtonStyleValue = (typeof BUTTON_STYLE_VALUES)[number]
export type ButtonTextTransformValue = (typeof BUTTON_TEXT_TRANSFORM_VALUES)[number]

export const DEFAULT_BRAND_FONT: BrandFontValue = 'system'
export const DEFAULT_BUTTON_RADIUS: ButtonRadiusValue = 'md'
export const DEFAULT_BUTTON_STYLE: ButtonStyleValue = 'solid'
export const DEFAULT_BUTTON_TEXT_TRANSFORM: ButtonTextTransformValue = 'normal'

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/

const urlOrInternalPathSchema = z
  .string()
  .trim()
  .max(1000)
  .refine(
    (value) => {
      if (!value) return true
      if (value.startsWith('/')) return true
      try {
        const parsed = new URL(value)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      } catch {
        return false
      }
    },
    { message: 'Must be a valid URL or internal path' }
  )

const optionalColorSchema = z
  .string()
  .trim()
  .max(7)
  .regex(HEX_COLOR_REGEX, 'Must be a valid 6-digit hex color')
  .optional()

const optionalStringSchema = z.string().trim().max(500).optional()
const optionalUrlSchema = z.union([z.string().trim().url().max(1000), z.literal('')]).optional()

export const brandKitUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  logoUrl: urlOrInternalPathSchema.optional(),
  faviconUrl: urlOrInternalPathSchema.optional(),
  emailLogoUrl: urlOrInternalPathSchema.optional(),
  checkoutLogoUrl: urlOrInternalPathSchema.optional(),

  primaryColor: optionalColorSchema,
  secondaryColor: optionalColorSchema,
  accentColor: optionalColorSchema,
  textColor: optionalColorSchema,
  emailHeaderColor: optionalColorSchema,

  headingFont: z.enum(BRAND_FONT_VALUES).optional(),
  bodyFont: z.enum(BRAND_FONT_VALUES).optional(),

  buttonRadius: z.enum(BUTTON_RADIUS_VALUES).optional(),
  buttonStyle: z.enum(BUTTON_STYLE_VALUES).optional(),
  buttonTextTransform: z.enum(BUTTON_TEXT_TRANSFORM_VALUES).optional(),

  emailFooterText: optionalStringSchema,
  supportEmail: z.union([z.string().trim().email().max(320), z.literal('')]).optional(),

  instagramUrl: optionalUrlSchema,
  facebookUrl: optionalUrlSchema,
  tiktokUrl: optionalUrlSchema,
  youtubeUrl: optionalUrlSchema,
})

export type BrandKitUpdateInput = z.infer<typeof brandKitUpdateSchema>

export function normalizeOptionalValue(value: string | undefined) {
  if (value == null) return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

const FONT_STACKS: Record<BrandFontValue, string> = {
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  inter: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  arial: 'Arial, sans-serif',
  helvetica: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  georgia: 'Georgia, serif',
  times: '"Times New Roman", Times, serif',
  poppins: '"Poppins", "Inter", system-ui, sans-serif',
  montserrat: '"Montserrat", "Inter", system-ui, sans-serif',
}

export function resolveFontStack(fontValue: string | null | undefined) {
  const normalized = (fontValue ?? DEFAULT_BRAND_FONT) as BrandFontValue
  return FONT_STACKS[normalized] ?? FONT_STACKS[DEFAULT_BRAND_FONT]
}

export function resolveButtonRadiusCss(radius: string | null | undefined) {
  switch (radius) {
    case 'none':
      return '0px'
    case 'sm':
      return '6px'
    case 'md':
      return '12px'
    case 'lg':
      return '18px'
    case 'full':
      return '9999px'
    default:
      return '12px'
  }
}
