# Graph Report - .  (2026-07-10)

## Corpus Check
- Large corpus: 811 files · ~546,272 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 4199 nodes · 10500 edges · 250 communities (220 shown, 30 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 68 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- route ts
- page js
- route ts
- route ts
- page js
- route ts
- doopify cli mjs
- route ts
- route ts
- route ts
- checkout create helpers ts
- StorefrontLayout Module
- route ts
- route ts
- ProductContext summary test ts
- route ts
- route ts
- route ts
- route ts
- page js
- route ts
- contracts ts
- layout js
- getShippingProviderLiveRates Module
- route ts
- page tsx
- toPromotionDetailDto Module
- route ts
- AdminButton tsx
- pricing ts
- page js
- AdminInput tsx
- AccountSettingsPanel js
- product media upload helpers js
- index ts
- route ts
- page js
- promotions ui helpers ts
- markCheckoutRecoveredByPaymentIntent Module
- page js
- scripts Module
- route ts
- OrderDetailView jsx
- env ts
- shipping label service ts
- page js
- AdminField tsx
- admin order detail service ts
- easypost ts
- POST Module
- route ts
- email template service ts
- route ts
- PublicStoreUrlIssue Module
- enqueueJob Module
- PromotionCartLine Module
- toStorefrontProduct Module
- route ts
- route ts
- ProductDetail js
- prisma ts
- prisma Module
- Doopify Agent Instructions
- Checkout Shipping Troubleshooting
- route ts
- CheckoutSuccessClientPage tsx
- shipping quote cache ts
- route ts
- route ts
- IntegrationsPanel js
- job service ts
- digital delivery admin service ts
- Webhook Configuration Guide
- route ts
- route ts
- AdminDropdown tsx
- searchPromotionCatalog Module
- settings context helpers ts
- team service ts
- create checkout workflow ts
- tsconfig json
- AdminSchedulePopover tsx
- security headers ts
- shipping provider service ts
- route ts
- route ts
- route ts
- route integration test ts
- draftOrdersData js
- dependencies Module
- route ts
- route ts
- route ts
- AdminSkeleton tsx
- payments settings helpers ts
- dispatcher ts
- digital download access service ts
- migrate media to object storage
- route ts
- route ts
- route ts
- product catalog view helpers ts
- storefront variant matching ts
- s3 media storage ts
- ensureDigitalDownloadDeliveryToken Module
- route ts
- page js
- devDependencies Module
- mapDbOrderToViewModel ts
- draft order conversion service ts
- route ts
- route ts
- proxy ts
- email settings status service ts
- email job health service ts
- vercel blob media storage ts
- resolveGrantStatus Module
- smart promotions admin spec ts
- legacy discount persistence helpers ts
- tax preview helpers ts
- media storage ts
- route ts
- route ts
- route ts
- route ts
- dashboard first run guide helpers
- digital order polish snapshots spec
- Checkout Architecture
- ensure store mjs
- reset owner mjs
- route ts
- route ts
- page js
- job service test ts
- postgres media storage ts
- checkout service integration test ts
- isUniqueConstraintError Module
- order notes service ts
- smart promotions checkout spec ts
- Backup And Restore Recovery
- route ts
- route ts
- route ts
- route ts
- page js
- AdminCommandPalette tsx
- rowsToNameSummary Module
- checkout loader service ts
- credential readiness ts
- route ts
- route ts
- route ts
- route ts
- replay audit route test ts
- page js
- page js
- PromotionVariantCommandPicker test tsx
- Checkout Rates Versus Label Cost
- Outbound Merchant Webhooks
- Private Beta Gates
- Official Stripe Node SDK
- Transactional Email Observability Plan
- Production Deployment Checklist
- Performance Audit Beta V2
- package json
- run integration tests mjs
- route ts
- route ts
- AdminSavedState tsx
- cart fulfillment ts
- Change Safety Checklist
- prepare integration db mjs
- route ts
- route test ts
- discountsData js
- listOrders ts
- ui snapshots spec js
- Event Architecture
- Payments Settings Drawer Reference
- Archived Doopify Launch Plan
- playwright config mjs
- seed mjs
- prisma js
- queueOrderConfirmationEmailDelivery Module
- Glass Admin UI System
- Glass Dashboard Tokens
- Compact Action Drawers
- Generic Audit Store
- AppShell Dependency
- Postgres Media Fallback
- Neon Postgres Branch
- Sequenced Delivery Phases
- Conservative Audit Scope
- Browser Setup Boundary
- Allow JS Compatibility
- V7 Admin Component Guide
- Order Management Overhaul Plan
- Local Database Bootstrap
- Digital Products Runbook
- Merchant Launch Guide
- Beta V2 Merge Readiness
- First Owner Setup
- Doopify Shopping Bag Icon
- bootstrap store mjs
- page js
- page js
- layout js
- getOrderByNumber ts
- Admin Only Customer Data Export
- Delivery Observability
- Email Settings Reference
- Smart Promotions V1
- eslint config mjs
- CodeQL Static Analysis
- next config mjs
- File Document Icon
- Next js Logo
- stripe gated spec js
- vitest config ts
- vitest integration config ts
- Globe Icon
- Professional Businesswoman Portrait
- Analog Watch Product Image
- Red Running Shoe Product Image
- Smartphone Product Image
- GENERAL SETTINGS CURRENCY OPTIONS
- GENERAL SETTINGS TIMEZONE OPTIONS

## God Nodes (most connected - your core abstractions)
1. `err()` - 333 edges
2. `ok()` - 330 edges
3. `requireAdmin()` - 216 edges
4. `parseBody()` - 136 edges
5. `unprocessable()` - 73 edges
6. `prisma` - 73 edges
7. `dollarsToCents()` - 60 edges
8. `centsToDollars()` - 57 edges
9. `requireOwner()` - 52 edges
10. `recordAuditLogBestEffort()` - 50 edges

## Surprising Connections (you probably didn't know these)
- `Doopify README` --references--> `Server-Owned Checkout`  [EXTRACTED]
  README.md → docs/PROJECT_INTENT.md
- `Continuous Integration Workflow` --conceptually_related_to--> `Real Database Verification`  [INFERRED]
  .github/workflows/ci.yml → docs/STATUS.md
- `Security And Correctness Hardening` --conceptually_related_to--> `Private Vulnerability Disclosure`  [INFERRED]
  docs/HARDENING.md → SECURITY.md
- `GET()` --indirect_call--> `timeline()`  [INFERRED]
  src/app/api/orders/[orderNumber]/detail/timeline/route.ts → src/lib/ordersData.js
- `SettingsWorkspace()` --indirect_call--> `statusLabel()`  [INFERRED]
  src/components/settings/SettingsWorkspace.js → src/components/orders/OrdersWorkspace.js

## Import Cycles
- 3-file cycle: `src/server/events/dispatcher.ts -> src/server/integrations/registry.ts -> src/server/services/email-delivery.service.ts -> src/server/events/dispatcher.ts`
- 4-file cycle: `src/server/events/dispatcher.ts -> src/server/integrations/registry.ts -> src/server/services/email.service.ts -> src/server/services/email-delivery.service.ts -> src/server/events/dispatcher.ts`
- 4-file cycle: `src/server/events/dispatcher.ts -> src/server/integrations/registry.ts -> src/server/services/email-delivery.service.ts -> src/server/services/order.service.ts -> src/server/events/dispatcher.ts`
- 5-file cycle: `src/server/events/dispatcher.ts -> src/server/integrations/registry.ts -> src/server/services/email.service.ts -> src/server/services/email-delivery.service.ts -> src/server/services/order.service.ts -> src/server/events/dispatcher.ts`

## Hyperedges (group relationships)
- **Commerce Truth And Verification** — prisma_postgres_source_of_truth_concept, server_owned_checkout_concept, verified_stripe_webhook_concept, real_db_verification_concept [EXTRACTED 1.00]
- **Production Safety Controls** — security_hardening_concept, secret_rotation_concept, backup_restore_concept, vulnerability_disclosure_concept [INFERRED 0.85]
- **Automated Verification** — github_workflows_ci_verification_gate_concept, github_workflows_integration_test_workflow_concept, github_workflows_codeql_analysis_concept [EXTRACTED 1.00]
- **Commerce Architecture and Operations** — docs_features_roadmap_document, docs_architecture_checkout_document, docs_architecture_events_document, docs_security_document, docs_archive_launch_rollout_document [INFERRED 0.75]
- **Shipping Checkout And Label Separation** — docs_archive_design_shipping_delivery_settings_reference_checkout_rates_vs_label_cost, docs_archive_design_shipping_delivery_settings_reference_live_rate_fallback, docs_archive_internal_shipping_setup_and_labels_roadmap_shipping_margin [EXTRACTED 1.00]
- **Provider Webhook Operational Boundaries** — docs_archive_design_webhooks_settings_compact_reference_outbound_webhooks, docs_archive_design_webhooks_settings_compact_reference_provider_webhook_separation, docs_archive_internal_resend_setup_guide_bounce_complaint_webhooks [EXTRACTED 1.00]
- **Deployment Security Verification** — docs_archive_internal_change_safety_checklist_verification_gate, docs_archive_internal_security_headers_plan_content_security_policy, docs_archive_internal_status_recent_updates_deployment_verification_gates [INFERRED 0.85]
- **Checkout Payment Verification** — docs_archive_operations_pilot_smoke_checklist_checkout_flow, docs_archive_internal_webhook_configuration_guide_stripe_webhooks, docs_performance_worker_separation_plan_beta_v2_inline_payment_truth [INFERRED 0.85]
- **Email Delivery Observability** — docs_archive_internal_transactional_email_observability_plan_email_delivery_records, docs_setup_email_delivery_observability, docs_setup_email_resend_provider [EXTRACTED 1.00]
- **Worker Reliability Hardening** — docs_performance_side_effect_classification_beta_v2_idempotency_hardening, docs_performance_worker_separation_plan_beta_v2_stale_lock_recovery, docs_operations_pilot_validation_runbook_recovery_testing [INFERRED 0.85]
- **Shipping Configuration to Checkout** — docs_setup_shipping_manual_rates, docs_setup_shipping_live_carrier_rates, docs_setup_shipping_hybrid_mode, docs_setup_shipping_checkout_troubleshooting [EXTRACTED 1.00]
- **Verified Stripe Payment Flow** — docs_setup_stripe_checkout_payment_intent, docs_setup_stripe_webhook_order_finalization, docs_setup_stripe_browser_redirect_not_truth, docs_setup_stripe_webhook_endpoint [EXTRACTED 1.00]
- **Team Access Lifecycle** — docs_setup_team_role_based_access, docs_setup_team_team_invitations, docs_setup_team_password_management, docs_setup_team_session_management, docs_setup_team_owner_recovery [EXTRACTED 1.00]

## Communities (250 total, 30 thin omitted)

### Community 0 - "route ts"
Cohesion: 0.04
Nodes (97): GET(), Params, Params, POST(), mocks, POST(), GET(), parsePage() (+89 more)

### Community 1 - "page js"
Cohesion: 0.04
Nodes (79): normalizeSettingsSessionUser(), SessionUserLike, isSettingsTabLoadingState(), SettingsSetupDiagnosticsState(), SettingsToastViewport(), BRAND_DRAWER, buildCheckoutMethodStatuses(), buildPaymentActivityRowsFromOrders() (+71 more)

### Community 2 - "route ts"
Cohesion: 0.03
Nodes (68): POST(), schema, addressSchema, itemSchema, POST(), schema, mocks, originalEnv (+60 more)

### Community 3 - "route ts"
Cohesion: 0.04
Nodes (70): DELETE(), normalizeOptional(), Params, PATCH(), updateFallbackRateSchema, createFallbackRateSchema, GET(), normalizeOptional() (+62 more)

### Community 4 - "page js"
Cohesion: 0.06
Nodes (52): metadata, metadata, metadata, AbandonedCheckoutsWorkspace(), formatMoneyFromCents(), formatTime(), AdminDashboardWorkspace(), formatCompactNumber() (+44 more)

### Community 5 - "route ts"
Cohesion: 0.05
Nodes (53): GET(), Params, mocks, GET(), Params, mocks, GET(), Params (+45 more)

### Community 6 - "doopify cli mjs"
Cohesion: 0.07
Nodes (71): appendQueryParams(), bootstrapStoreAndOwner(), buildDoopifyBaseUrl(), buildEnvUpdates(), buildResendWebhookUrl(), buildScopeArg(), buildStripeFormBody(), buildStripeWebhookUrl() (+63 more)

### Community 7 - "route ts"
Cohesion: 0.06
Nodes (56): createDigitalAssetSchema, GET(), POST(), requireStoreId(), mocks, toHttpError(), POST(), requireStoreId() (+48 more)

### Community 8 - "route ts"
Cohesion: 0.08
Nodes (42): GET(), PATCH(), serializeShippingSettings(), mocks, updateShippingSettingsSchema, normalizeOptional(), PATCH(), serializeSetupSnapshot() (+34 more)

### Community 9 - "route ts"
Cohesion: 0.09
Nodes (50): DELETE(), GET(), RouteContext, mocks, buildSecretMap(), credentialMetaMaskedValue(), credentialMetaPresent(), deriveConnectionState() (+42 more)

### Community 10 - "checkout create helpers ts"
Cohesion: 0.06
Nodes (43): isCheckoutEmailValid(), normalizeCheckoutEmail(), normalizeKey(), resolveEffectivePublishableKey(), shouldFetchStripeConfigFallback(), buildCheckoutDiscountRows(), buildCheckoutPromotionHighlights(), centsToAmount() (+35 more)

### Community 11 - "StorefrontLayout Module"
Cohesion: 0.06
Nodes (39): StorefrontLayout(), formatContact(), metadata, PrivacyPage(), metadata, supportContact(), TermsPage(), GET() (+31 more)

### Community 12 - "route ts"
Cohesion: 0.06
Nodes (40): Params, PUT(), schema, DELETE(), GET(), mediaSchema, optionSchema, optionValueSchema (+32 more)

### Community 13 - "route ts"
Cohesion: 0.08
Nodes (36): DELETE(), mapDiscountResponse(), Params, PATCH(), resolveMinimumOrderCents(), mocks, updateSchema, clampPage() (+28 more)

### Community 14 - "ProductContext summary test ts"
Cohesion: 0.14
Nodes (42): buildCartesianCombinations(), buildVariantFromTemplate(), buildVariantTitle(), createDefaultVariant(), createEmptyProductDraft(), createEntityId(), createId(), createImage() (+34 more)

### Community 15 - "route ts"
Cohesion: 0.08
Nodes (37): GET(), mocks, AbandonedCheckoutListParams, AbandonedCheckoutSummary, buildRecoveryUrl(), canSendRecoveryEmail(), CheckoutAddress, checkoutAddressSchema (+29 more)

### Community 16 - "route ts"
Cohesion: 0.08
Nodes (33): Params, POST(), schema, mocks, validPayload, Params, PATCH(), schema (+25 more)

### Community 17 - "route ts"
Cohesion: 0.10
Nodes (34): Params, PATCH(), refundItemSchema, updateReturnSchema, AuditActor, ACTIVE_RETURN_STATUSES, ALLOWED_RETURN_TRANSITIONS, buildRemainingEligibleQuantityMap() (+26 more)

### Community 18 - "route ts"
Cohesion: 0.10
Nodes (34): createShippingZoneSchema, GET(), POST(), rateSchema, mocks, DELETE(), PATCH(), RouteContext (+26 more)

### Community 19 - "page js"
Cohesion: 0.08
Nodes (31): buildCheckoutMethodDraft(), buildCheckoutMethodPatch(), isCheckoutMethodDirty(), isCheckoutMethodEqual(), providerSelectionToLegacyUsage(), ApiRequestError, DEFAULT_FALLBACK_RATE_FORM, DEFAULT_LOCAL_DELIVERY_FORM (+23 more)

### Community 20 - "route ts"
Cohesion: 0.10
Nodes (32): COLLECTION_SORT_VALUES, DELETE(), GET(), Params, revalidateCollectionPaths(), mocks, updateSchema, mocks (+24 more)

### Community 21 - "contracts ts"
Cohesion: 0.10
Nodes (34): PROMOTION_FULFILLMENT_TYPES, PROMOTION_REWARD_TYPES, PROMOTION_STATUSES, PROMOTION_TYPES, PromotionApplicationDraft, PromotionDraftInput, PromotionEvaluationInput, PromotionEvaluationOptions (+26 more)

### Community 22 - "layout js"
Cohesion: 0.09
Nodes (23): metadata, inter, manrope, metadata, AdminSpotlightRuntime(), OrderDetailClientPage(), DiscountsContext, DiscountsProvider() (+15 more)

### Community 23 - "getShippingProviderLiveRates Module"
Cohesion: 0.12
Nodes (33): getShippingProviderLiveRates(), allowLegacyShippingFallbacks(), buildDefaultParcelFromStore(), buildManualQuoteFallback(), buildRateRequestFromStore(), convertToInches(), convertToOz(), diagnoseModernManualRateMismatch() (+25 more)

### Community 24 - "route ts"
Cohesion: 0.10
Nodes (28): GET(), mocks, buildMessage(), GET(), mocks, CheckoutPage(), metadata, deriveStripeVerificationStatus() (+20 more)

### Community 25 - "page tsx"
Cohesion: 0.07
Nodes (30): AdminSelectableTile(), AdminSelectableTileProps, buildClassName(), AdminSplitPane(), AdminSplitPaneProps, AdminUploadDropzone(), AdminUploadDropzoneProps, buildClassName() (+22 more)

### Community 26 - "toPromotionDetailDto Module"
Cohesion: 0.11
Nodes (32): toPromotionDetailDto(), toPromotionListItemDto(), asVariantCatalogById(), buildDraftRows(), buildProductStatusIssues(), buildV1PolicyIssues(), buildVariantLookupRows(), createError() (+24 more)

### Community 27 - "route ts"
Cohesion: 0.12
Nodes (29): Params, POST(), revalidateProductPaths(), mocks, LandingPage(), generateMetadata(), ProductPage(), attachMediaUrls() (+21 more)

### Community 28 - "AdminButton tsx"
Cohesion: 0.09
Nodes (25): AdminButton(), AdminButtonProps, buildClassName(), AdminDrawer(), AdminDrawerContextItem, AdminDrawerProps, AdminDrawerTab, buildClassName() (+17 more)

### Community 29 - "pricing ts"
Cohesion: 0.11
Nodes (32): allowCheckoutFallbackDefaults(), assertIntegerCents(), buildCheckoutPricing(), buildCheckoutPricingWithDecisions(), buildCheckoutPricingWithDecisionsCents(), calculateDiscountAmountCents(), calculateShipping(), calculateTax() (+24 more)

### Community 30 - "page js"
Cohesion: 0.11
Nodes (26): AdminLiveStatus(), AdminLiveStatusProps, buildClassName(), formatDashboardDate(), formatDashboardTime(), getStatusTone(), OrdersWorkspace(), selectOptions() (+18 more)

### Community 31 - "AdminInput tsx"
Cohesion: 0.09
Nodes (24): AdminInput(), AdminInputProps, AdminSelect(), AdminSelectOption, AdminSelectProps, buildClassName(), AdminTooltip(), buildRefundDraftItems() (+16 more)

### Community 32 - "AccountSettingsPanel js"
Cohesion: 0.11
Nodes (20): AccountSettingsPanel(), sectionCardsForTab(), SettingsCardSkeleton(), SettingsPageSkeleton(), SettingsProviderRowsSkeleton(), SettingsWorkspaceLoadState(), ShippingSettingsWorkspaceSkeleton(), getTeamAccessNotice() (+12 more)

### Community 33 - "product media upload helpers js"
Cohesion: 0.14
Nodes (30): buildProductMediaPayload(), fetchPersistedProductDetail(), getOversizedMediaFiles(), isOversizedMediaFile(), MAX_MEDIA_UPLOAD_BYTES, parseMediaUploadResponse(), resolveMediaUploadFailureMessage(), resolveMediaUploadStrategy() (+22 more)

### Community 34 - "index ts"
Cohesion: 0.10
Nodes (25): makeLogger(), parseSecretErrors(), runWorker(), RunWorkerInput, SleepFn, buildRouteTargets(), buildWorkerConfig(), defaultWorkerLogger() (+17 more)

### Community 35 - "route ts"
Cohesion: 0.14
Nodes (27): GET(), mocks, recordAuditLogBestEffort(), AuthLikeUser, base32Decode(), base32Encode(), buildOtpAuthUri(), ChallengeContext (+19 more)

### Community 36 - "page js"
Cohesion: 0.11
Nodes (16): ConfirmDialog(), formatScheduleText(), ProductEditorDrawer(), formatAssetDate(), mergeLibraryAssets(), ProductMediaManager(), ProductsWorkspace(), DEFAULT_OPTION_SUGGESTIONS (+8 more)

### Community 37 - "promotions ui helpers ts"
Cohesion: 0.09
Nodes (30): formatFixedAmountDraftValue(), isEligiblePhysicalProduct(), ListQueryParams, normalizePromotionCatalogFulfillmentType(), normalizePromotionCatalogProduct(), normalizePromotionCatalogStatus(), normalizePromotionCatalogVariant(), PROMOTION_REWARD_TYPES (+22 more)

### Community 38 - "markCheckoutRecoveredByPaymentIntent Module"
Cohesion: 0.12
Nodes (29): markCheckoutRecoveredByPaymentIntent(), allowCheckoutFallbackDefaults(), buildDigitalNoShippingSnapshot(), CheckoutAddress, CheckoutItemInput, CheckoutPayload, CheckoutPromotionApplicationSnapshot, CheckoutPromotionLineAllocationSnapshot (+21 more)

### Community 39 - "page js"
Cohesion: 0.11
Nodes (25): BROWSE_FILTERS, buildLegacyDiscountPreview(), CREATE_METHODS, CREATE_STEPS, DiscountsWorkspace(), formatLegacyTypeLabel(), formatUpdatedDisplayLabel(), getLegacyPublishMode() (+17 more)

### Community 40 - "scripts Module"
Cohesion: 0.07
Nodes (30): scripts, build, db:ensure-store, db:generate, db:migrate, db:push, db:seed, db:seed:bootstrap (+22 more)

### Community 41 - "route ts"
Cohesion: 0.12
Nodes (25): buildCategorySummaries(), buildGroupedNextActions(), CATEGORY_LABELS, checkNeedsAction(), computeCompletionPercent(), dedupe(), gatherDatabaseFacts(), GET() (+17 more)

### Community 42 - "OrderDetailView jsx"
Cohesion: 0.13
Nodes (21): amountFromSummary(), digitalDeliveryStatusLabel(), digitalDeliveryStatusTone(), formatAddress(), formatMoney(), formatPromotionRewardSummary(), formatPromotionType(), hasPrefetchedDigitalDeliveryData() (+13 more)

### Community 43 - "env ts"
Cohesion: 0.11
Nodes (19): env, envSchema, getStripeSdkClient(), normalizeSecretKey(), resolveStripeSecretKey(), constructor(), envState, stripeCtorSpy (+11 more)

### Community 44 - "shipping label service ts"
Cohesion: 0.13
Nodes (26): buildShippingRateRequest(), buyOrderShippingLabel(), getOrderForLabelWorkflow(), getOrderShippingRatesForLabel(), isUnitedStatesCountry(), normalizeCountry(), normalizeEmail(), normalizePhone() (+18 more)

### Community 45 - "page js"
Cohesion: 0.14
Nodes (22): metadata, buildDeliveryStats(), countByStatus(), DELIVERY_STATUS_OPTIONS, DELIVERY_TYPE_OPTIONS, filterDeliveriesBySearch(), getDeliveryDisplayStatus(), getModeStatusFilter() (+14 more)

### Community 46 - "AdminField tsx"
Cohesion: 0.10
Nodes (22): AdminField(), AdminFieldProps, AdminFormSection(), AdminFormSectionProps, AdminToolbar(), AdminToolbarProps, AutomaticPromotionsWorkspace(), parseApiErrorMessage() (+14 more)

### Community 47 - "admin order detail service ts"
Cohesion: 0.14
Nodes (25): buildCoreAvailableActions(), getAdminOrderCoreByOrderNumber(), getAdminOrderDetailByOrderNumber(), getAdminOrderDetailFulfillmentByOrderNumber(), getAdminOrderDetailTimelineByOrderNumber(), joinAddress(), mapCustomerVisibleNotes(), mapFulfillmentList() (+17 more)

### Community 48 - "easypost ts"
Cohesion: 0.10
Nodes (12): easypostProviderAdapter, shippoProviderAdapter, ShippingProviderAdapter, ShippingProviderConnectionResult, ShippingProviderPurchasedLabel, ShippingProviderPurchaseLabelRequest, ShippingProviderTrackingStatus, ShippingProviderTrackingStatusRequest (+4 more)

### Community 49 - "POST Module"
Cohesion: 0.17
Nodes (25): POST(), sendTransactionalEmail(), ApplyEmailProviderWebhookEventResult, createEmailDelivery(), CreateEmailDeliveryInput, emailDeliveryClient(), EmailDeliveryDiagnostics, EmailDeliveryListRecord (+17 more)

### Community 50 - "route ts"
Cohesion: 0.15
Nodes (21): GET(), maskError(), mocks, logRunFailure(), maskError(), POST(), mocks, LaunchReadinessRunResult (+13 more)

### Community 51 - "email template service ts"
Cohesion: 0.20
Nodes (25): AbandonedCheckoutRecoveryInput, buildAbandonedCheckoutRecoveryEmailMessage(), buildAbandonedCheckoutRecoveryHtml(), buildCustomizedFulfillmentTrackingHtml(), buildCustomizedOrderConfirmationHtml(), buildFulfillmentTrackingEmailMessage(), buildFulfillmentTrackingHtml(), buildFulfillmentTrackingTestHtml() (+17 more)

### Community 52 - "route ts"
Cohesion: 0.18
Nodes (19): Params, POST(), mocks, isAuthorized(), POST(), mocks, POST(), mocks (+11 more)

### Community 53 - "PublicStoreUrlIssue Module"
Cohesion: 0.12
Nodes (20): PublicStoreUrlIssue, gatherProductFacts(), mapProviderStateToVerificationStatus(), normalizeRunnerHealth(), pickEmailProviderSnapshot(), runLaunchReadinessCheck(), mocks, TimedOptionalResult (+12 more)

### Community 54 - "enqueueJob Module"
Cohesion: 0.11
Nodes (22): enqueueJob(), handlers, JOB_TYPES, JobHandler, JobHandlerContext, JobType, recordAnalyticsEventPayloadSchema, sendFulfillmentEmailPayloadSchema (+14 more)

### Community 55 - "PromotionCartLine Module"
Cohesion: 0.15
Nodes (20): PromotionCartLine, PromotionDefinition, allocateByFixedAmount(), allocateByPercentage(), allocateFreeReward(), buildSkip(), buildTargets(), compareCandidates() (+12 more)

### Community 56 - "toStorefrontProduct Module"
Cohesion: 0.16
Nodes (21): toStorefrontProduct(), AvailabilityProduct, AvailabilityVariant, canPurchaseProduct(), canPurchaseVariant(), getAvailabilityMessage(), getProductAvailabilityBadge(), getVariantInventoryReadiness() (+13 more)

### Community 57 - "route ts"
Cohesion: 0.12
Nodes (19): issueRefundSchema, Params, derivePaymentStatus(), getOrderRefunds(), getRefund(), issueRefund(), IssueRefundInput, REFUND_AUDIT_REDACTIONS (+11 more)

### Community 58 - "route ts"
Cohesion: 0.13
Nodes (16): gatherProductFacts(), GET(), mocks, getStripeProviderStatus(), evaluateProductLaunchReadiness(), ProductLaunchReadinessFacts, ProductLaunchReadinessInput, ProductLaunchReadinessSample (+8 more)

### Community 59 - "ProductDetail js"
Cohesion: 0.23
Nodes (16): ProductDetail(), ShopPage(), CartDrawer(), CollectionDetailView(), CartContext, CartProvider(), loadCart(), normalizeCartItem() (+8 more)

### Community 60 - "prisma ts"
Cohesion: 0.13
Nodes (16): buildPrismaClient(), getPrismaAdapter(), getPrismaSchemaOverride(), globalForPrisma, normalizePgConnectionString(), mocks, ALLOWED_TRANSITIONS, closeReturnWithRefund() (+8 more)

### Community 61 - "prisma Module"
Cohesion: 0.16
Nodes (17): prisma, baseExistingDelivery, mocks, calculateNextRetry(), claimOutboundDelivery(), createOutboundWebhookSignature(), emitWebhookAnalyticsEvent(), normalizeError() (+9 more)

### Community 62 - "Doopify Agent Instructions"
Cohesion: 0.10
Nodes (23): Doopify Agent Instructions, Doopify Changelog, Contributing Guide, Documentation Contributing Pointer, Doopify Hardening Status, Doopify Project Intent, Doopify Current Status, Dependabot Configuration (+15 more)

### Community 63 - "Checkout Shipping Troubleshooting"
Cohesion: 0.11
Nodes (23): Checkout Shipping Troubleshooting, Hybrid Shipping Mode, Launch Readiness Shipping Check, Live Carrier Rates, Manual Shipping Rates, Shipping Label Purchasing, Shipping Setup, Shipping Zones and Tax Rules (+15 more)

### Community 64 - "route ts"
Cohesion: 0.13
Nodes (18): POST(), schema, mocks, cleanupExpiredSharedWindows(), consumeInMemoryRateLimit(), consumeRateLimit(), consumeSharedRateLimit(), globalForRateLimit (+10 more)

### Community 65 - "CheckoutSuccessClientPage tsx"
Cohesion: 0.11
Nodes (18): ApiFailure, ApiResponse, ApiSuccess, buildPhoneHref(), CartContextValue, CHECKOUT_RESULT_PRIMARY_ACTION_STYLE, CheckoutStatus, CheckoutStatusResponseData (+10 more)

### Community 66 - "shipping quote cache ts"
Cohesion: 0.15
Nodes (18): buildCheckoutAddressFingerprint(), buildCheckoutCartFingerprint(), CheckoutAddressFingerprintInput, CheckoutLineItemFingerprintInput, checkoutShippingQuoteCache, clearCheckoutShippingQuoteCache(), getProviderShipmentId(), getStoredCheckoutShippingQuote() (+10 more)

### Community 67 - "route ts"
Cohesion: 0.15
Nodes (15): GET(), Params, Params, POST(), mocks, POST(), RouteContext, mocks (+7 more)

### Community 68 - "route ts"
Cohesion: 0.13
Nodes (18): GET(), parseOptionalFilter(), mocks, promotionCreateSchema, promotionPatchSchema, promotionStatusSchema, promotionTypeSchema, qualifierSchema (+10 more)

### Community 69 - "IntegrationsPanel js"
Cohesion: 0.20
Nodes (15): buildCreatePayload(), buildUpdatePayload(), EMPTY_DRAFT, formatStatusTone(), generateSigningSecret(), getEventNames(), IntegrationsPanel(), maskDestination() (+7 more)

### Community 70 - "job service ts"
Cohesion: 0.16
Nodes (21): calculateRetryRunAt(), claimDueJobs(), ClaimDueJobsOptions, clampLimit(), DUE_JOB_STATUSES, dueJobsWhere(), EnqueueJobOptions, GetJobsFilters (+13 more)

### Community 71 - "digital delivery admin service ts"
Cohesion: 0.16
Nodes (21): AdminDigitalDownloadLink, buildDownloadPath(), decryptStoredToken(), DigitalDeliveryEventSummary, DigitalDeliveryGrantStatus, DigitalDeliveryGrantSummary, getAdminDigitalDownloadLink(), getOrderDigitalContext() (+13 more)

### Community 72 - "Webhook Configuration Guide"
Cohesion: 0.10
Nodes (21): Webhook Configuration Guide, Webhook Signature Verification, Stripe Webhooks, Pilot Checkout Flow, Doopify Pilot Smoke Checklist, Pilot Inventory Verification, Doopify Release Candidate Report, Payment Validation Blockers (+13 more)

### Community 73 - "route ts"
Cohesion: 0.18
Nodes (17): GET(), parseStatus(), mocks, WEBHOOK_STATUSES, claimWebhookDeliveryForRetry(), getReplayBlockers(), getRetryBlockers(), getRetryDelayMs() (+9 more)

### Community 74 - "route ts"
Cohesion: 0.19
Nodes (17): POST(), providerWebhookName(), resolveProvider(), mocks, applyShippingProviderTrackingWebhookEvent(), ApplyShippingProviderWebhookEventResult, isEasyPostSignatureValid(), isShippoSignatureValid() (+9 more)

### Community 75 - "AdminDropdown tsx"
Cohesion: 0.16
Nodes (18): AdminDropdown(), AdminDropdownProps, buildClassName(), AdminThemeContext, AdminThemeContextValue, AdminThemeProvider(), applyTheme(), getInitialPreference() (+10 more)

### Community 76 - "searchPromotionCatalog Module"
Cohesion: 0.16
Nodes (20): searchPromotionCatalog(), appendPromotionPendingSelections(), appendPromotionSelectionRow(), beginPromotionCatalogSearch(), buildPromotionCatalogListUrl(), buildPromotionCatalogProductDetailUrl(), disablePromotionById(), extractPromotionValidationIssues() (+12 more)

### Community 77 - "settings context helpers ts"
Cohesion: 0.19
Nodes (16): buildSettingsPatchPayload(), parseNumberField(), SETTINGS_DEFAULTS, transformStore(), SettingsContext, SettingsProvider(), isSupportedStoreCurrency(), isSupportedStoreTimeZone() (+8 more)

### Community 78 - "team service ts"
Cohesion: 0.17
Nodes (20): AcceptInviteInput, assertNotLastOwner(), bootstrapOwner(), BootstrapOwnerInput, countActiveOwners(), createTeamUser(), CreateTeamUserInput, inviteTeamUser() (+12 more)

### Community 79 - "create checkout workflow ts"
Cohesion: 0.16
Nodes (15): createCheckoutWorkflow, CreateCheckoutWorkflowInput, CreateCheckoutWorkflowResult, runCreateCheckoutWorkflow(), mocks, finalizePaidOrderWorkflow, FinalizePaidOrderWorkflowInput, FinalizePaidOrderWorkflowResult (+7 more)

### Community 80 - "tsconfig json"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+12 more)

### Community 81 - "AdminSchedulePopover tsx"
Cohesion: 0.20
Nodes (19): AdminSchedulePopover(), AdminSchedulePopoverProps, buildMonthDays(), buildTimeSlots(), endOfMonth(), formatMonthLabel(), formatSelectedDate(), formatSelectedDateTime() (+11 more)

### Community 82 - "security headers ts"
Cohesion: 0.17
Nodes (18): buildCsp(), buildSecurityHeaders(), CspMode, DEFAULT_MEDIA_ORIGINS, parseOrigins(), resolveCspMode(), resolveCspReportToEndpoint(), resolveCspReportToGroup() (+10 more)

### Community 83 - "shipping provider service ts"
Cohesion: 0.21
Nodes (18): connectShippingProvider(), ConnectShippingProviderInput, disconnectShippingProvider(), DisconnectShippingProviderInput, findLatestProviderIntegration(), getProviderApiKey(), getShippingProviderConnectionStatus(), normalizeApiKey() (+10 more)

### Community 84 - "route ts"
Cohesion: 0.19
Nodes (15): POST(), clearAuthCookie(), decodeToken(), getAuthCookieOptions(), JWTPayload, signToken(), escapeRegExp(), getCookieValue() (+7 more)

### Community 85 - "route ts"
Cohesion: 0.15
Nodes (15): GET(), mocks, buildPublicStatusReport(), checkDatabaseReachable(), DatabaseStatus, EmailStatus, MediaProvider, normalizeMediaProvider() (+7 more)

### Community 86 - "route ts"
Cohesion: 0.23
Nodes (14): POST(), mocks, getJobRunnerSecret(), isJobRunnerAuthorized(), getLastSeenAt(), JobRunnerHeartbeatView, listJobRunnerHeartbeats(), normalizeErrorSummary() (+6 more)

### Community 87 - "route integration test ts"
Cohesion: 0.16
Nodes (12): mocks, buildDownloadUrl(), BuyerDigitalDownloadAvailability, BuyerDigitalDownloadLink, decryptStoredToken(), EnsureDigitalDownloadDeliveryInput, getBuyerDigitalDownloadAvailabilityForPaidOrder(), isUniqueConstraintError() (+4 more)

### Community 88 - "draftOrdersData js"
Cohesion: 0.27
Nodes (17): calculateDraftTotals(), convertDraftOrderToOrder(), createDraftLineItemFromProduct(), createDraftOrderSeed(), normalizeEmail(), normalizeText(), resolveDraftLineItemDisplay(), resolveDraftLineItemUnitPrice() (+9 more)

### Community 89 - "dependencies Module"
Cohesion: 0.11
Nodes (18): dependencies, bcryptjs, dotenv, framer-motion, jsonwebtoken, minio, next, nodemailer (+10 more)

### Community 90 - "route ts"
Cohesion: 0.20
Nodes (13): GET(), PATCH(), schema, mocks, POST(), getToken(), getAuthTokenFromCookieHeader(), getSessionUser() (+5 more)

### Community 91 - "route ts"
Cohesion: 0.21
Nodes (15): Params, POST(), EDITABLE_TEMPLATE_KEYS, EmailTemplateKey, EmailTemplateSetting, EmailTemplateSettingFields, getEmailTemplateSetting(), getTemplateDefaults() (+7 more)

### Community 92 - "route ts"
Cohesion: 0.16
Nodes (12): GET(), Params, mocks, GET(), mocks, CollectionPage(), generateMetadata(), CollectionsPage() (+4 more)

### Community 93 - "AdminSkeleton tsx"
Cohesion: 0.14
Nodes (12): AdminSkeletonProps, buildClassName(), SkeletonAvatar(), SkeletonChip(), SkeletonLine(), SkeletonProps, AdminTable(), AdminTableColumn (+4 more)

### Community 94 - "payments settings helpers ts"
Cohesion: 0.18
Nodes (13): buildCheckoutMethodStatuses(), buildPaymentActivityRowsFromOrders(), buildPaymentProviderRows(), BuildProviderRowsInput, buildStripeProviderActionView(), formatDisplayCurrency(), formatProviderLabel(), normalizeStatusLabel() (+5 more)

### Community 95 - "dispatcher ts"
Cohesion: 0.24
Nodes (11): AnyInternalEventHandler, DoopifyEventName, DoopifyEvents, InternalEventHandler, defineAnalyticsHandler(), defineHandler(), AnalyticsEventName, extractAnalyticsReferences() (+3 more)

### Community 96 - "digital download access service ts"
Cohesion: 0.18
Nodes (16): createS3PrivateClient(), DownloadAttemptResult, GrantWithAsset, logDownloadEvent(), parsePrivateStorageKeyToSegments(), readFromLocalPrivateStorage(), readFromS3PrivateStorage(), readPrivateDigitalAssetBytes() (+8 more)

### Community 97 - "migrate media to object storage"
Cohesion: 0.19
Nodes (15): args, argValues, buildObjectClient(), buildPublicUrl(), buildStorageKey(), clearData, isDryRun, limit (+7 more)

### Community 98 - "route ts"
Cohesion: 0.22
Nodes (12): GET(), buildDeploymentValidationReport(), DeploymentCheck, DeploymentCheckStatus, DeploymentValidationFacts, DeploymentValidationReport, evaluateAbandonedCheckoutAuth(), evaluateCspMode() (+4 more)

### Community 99 - "route ts"
Cohesion: 0.24
Nodes (12): GET(), mocks, buildStripeWebhookEndpoint(), evaluatePublicStoreUrl(), hasPlaceholderPattern(), isHttpProtocol(), LOCAL_HOSTS, PLACEHOLDER_SUBSTRINGS (+4 more)

### Community 100 - "route ts"
Cohesion: 0.20
Nodes (12): POST(), RouteContext, DELETE(), RouteContext, createSchema, GET(), POST(), mocks (+4 more)

### Community 101 - "product catalog view helpers ts"
Cohesion: 0.22
Nodes (12): CatalogViewState, getCatalogViewState(), PRODUCT_CATALOG_EMPTY_STATE, FILTERS, ProductCatalog(), getProductFeaturedImage(), getProductStockLabel(), getProductStockStatus() (+4 more)

### Community 102 - "storefront variant matching ts"
Cohesion: 0.28
Nodes (14): findVariantBySelectedOptions(), getVariantOptionValues(), isVariantValueSelectable(), normalizeOptions(), normalizeOptionValuesInput(), normalizeSelectedOptions(), normalizeText(), OptionValue (+6 more)

### Community 103 - "s3 media storage ts"
Cohesion: 0.16
Nodes (10): buildS3MediaStorageKey(), createS3MediaStorageAdapter(), MediaAssetCreateResult, MediaAssetReadResult, MinioClientLike, PrismaMediaClient, resolvePublicUrl(), S3MediaAdapterDeps (+2 more)

### Community 104 - "ensureDigitalDownloadDeliveryToken Module"
Cohesion: 0.21
Nodes (12): ensureDigitalDownloadDeliveryToken(), createDownloadToken(), getDefaultDigitalGrantPolicy(), hashDownloadToken(), NOW, buildGrantKey(), issueDigitalDownloadGrantsForPaidOrder(), IssueDigitalGrantsInput (+4 more)

### Community 105 - "route ts"
Cohesion: 0.18
Nodes (10): EmailDeliverySnapshot, getEmailDeliverySnapshot(), Params, POST(), mocks, getEmailDeliveryById(), hasResendEligibleStatus(), mocks (+2 more)

### Community 106 - "page js"
Cohesion: 0.19
Nodes (10): metadata, FeaturedCollectionsGrid(), AnimationConfig, Component(), joinClassNames(), mapRange(), NoiseConfig, ResponsiveImage (+2 more)

### Community 107 - "devDependencies Module"
Cohesion: 0.14
Nodes (14): devDependencies, eslint, eslint-config-next, @playwright/test, prisma, @types/bcryptjs, @types/jsonwebtoken, @types/node (+6 more)

### Community 108 - "mapDbOrderToViewModel ts"
Cohesion: 0.21
Nodes (12): DbOrderAddress, DbOrderCustomer, DbOrderEvent, DbOrderFulfillment, DbOrderItem, DbOrderLike, formatAddress(), mapDbOrderToViewModel() (+4 more)

### Community 109 - "draft order conversion service ts"
Cohesion: 0.22
Nodes (11): buildAddress(), convertDraftOrder(), ConvertDraftOrderInput, ConvertDraftOrderResult, DraftConversionLineItemInput, draftMarker(), DraftOrderConversionError, normalizeText() (+3 more)

### Community 110 - "route ts"
Cohesion: 0.28
Nodes (10): GET(), POST(), schema, mocks, POST(), schema, setAuthCookie(), loginUser() (+2 more)

### Community 111 - "route ts"
Cohesion: 0.27
Nodes (10): DELETE(), PATCH(), patchSchema, RouteContext, mocks, deleteDisabledTeamUser(), disableTeamUser(), reactivateTeamUser() (+2 more)

### Community 112 - "proxy ts"
Cohesion: 0.29
Nodes (11): config, createLoginUrl(), isAdminPage(), isPublicMediaReadRequest(), jsonWithSecurityHeaders(), nextWithSecurityHeaders(), proxy(), PUBLIC_PREFIXES (+3 more)

### Community 113 - "email settings status service ts"
Cohesion: 0.23
Nodes (11): EmailJobHealthStatus, EmailProviderStatus, EmailSettingsStatus, EmailVerificationStatus, getEmailSettingsStatusSnapshot(), hasConfiguredProvider(), normalize(), providerPriorityScore() (+3 more)

### Community 114 - "email job health service ts"
Cohesion: 0.22
Nodes (11): EMAIL_JOB_TYPES, EmailJobHealthInput, EmailJobHealthLevel, EmailJobHealthSnapshot, EmailJobRunnerHealth, evaluateEmailJobHealth(), FAILED_STATUSES, getEmailJobHealthSnapshot() (+3 more)

### Community 115 - "vercel blob media storage ts"
Cohesion: 0.19
Nodes (9): BlobPutResult, buildVercelBlobStorageKey(), createVercelBlobMediaStorageAdapter(), PrismaMediaAssetCreateResult, PrismaMediaAssetReadResult, PrismaMediaClient, sanitizeFilename(), VercelBlobMediaAdapterDeps (+1 more)

### Community 116 - "resolveGrantStatus Module"
Cohesion: 0.24
Nodes (10): resolveGrantStatus(), resolveDigitalDownloadByToken(), mocks, buildDigitalGrantExpiry(), canUseDigitalDownloadGrant(), DigitalGrantPolicy, DigitalGrantUsageInput, hasDigitalGrantDownloadsRemaining() (+2 more)

### Community 117 - "smart promotions admin spec ts"
Cohesion: 0.22
Nodes (11): AuthSession, createAdminSession(), discountCodesListPayload(), ensureScreenshotDir(), mockOrderDetailApis(), mockPromotionsPageApis(), orderWithPromotionsPayload(), prisma (+3 more)

### Community 118 - "legacy discount persistence helpers ts"
Cohesion: 0.38
Nodes (9): buildLegacyDiscountApiPayload(), isPersistedLegacyDiscountId(), LegacyDiscountDraft, mapLegacyDraftMethodToApi(), mapLegacyDraftStatusToApi(), normalizeLegacyDiscountCode(), normalizeNumericInput(), normalizeOptionalString() (+1 more)

### Community 119 - "tax preview helpers ts"
Cohesion: 0.27
Nodes (9): calculateTaxPreview(), formatRate(), normalizeRegionValue(), roundMoney(), TaxPreviewInput, TaxPreviewResult, TaxRuleInput, TaxSettingsInput (+1 more)

### Community 120 - "media storage ts"
Cohesion: 0.29
Nodes (9): getMediaStorageAdapterForProvider(), getS3ConfigFromEnv(), getVercelBlobConfigFromEnv(), mediaUrl(), normalizeMediaProvider(), resetMediaStorageAdapterCacheForTests(), resolveMediaPublicBaseUrlFromEnv(), postgresMediaStorageAdapter (+1 more)

### Community 121 - "route ts"
Cohesion: 0.42
Nodes (8): asRecord(), CspReportSummary, getReportSummary(), POST(), shouldLogCspReport(), summarizeClassicCspReport(), summarizeReportToPayload(), toText()

### Community 122 - "route ts"
Cohesion: 0.31
Nodes (8): clampPage(), clampPageSize(), createSchema, GET(), POST(), sanitizeSecrets(), mocks, uniqueStrings()

### Community 123 - "route ts"
Cohesion: 0.40
Nodes (7): GET(), PATCH(), serializeTaxSettings(), mocks, updateTaxSettingsSchema, getTaxSettingsStore(), updateTaxSettings()

### Community 124 - "route ts"
Cohesion: 0.31
Nodes (7): getVerificationHeaders(), POST(), mocks, verifyEmailProviderWebhookPayload(), applyEmailProviderWebhookEvent(), parseEmailProviderWebhookPayload(), parseTimestamp()

### Community 125 - "dashboard first run guide helpers"
Cohesion: 0.22
Nodes (8): buildDashboardFirstRunGuide(), DashboardFirstRunGuide, DashboardGuideStep, OPTIONAL_STEP_DEFS, REQUIRED_STEP_DEFS, SetupWizardReport, WizardStep, WizardStepStatus

### Community 126 - "digital order polish snapshots spec"
Cohesion: 0.27
Nodes (8): AuthSession, buildDigitalDeliveryPayload(), buildOrderDetailPayload(), createAdminSession(), mockOrderDetailApis(), prisma, readEnvValue(), viewportTargets

### Community 127 - "Checkout Architecture"
Cohesion: 0.25
Nodes (9): Checkout Architecture, Archived Documentation Refresh Pack, Phase 3 Kickoff, Archive Documentation README, Doopify Features Roadmap, Doopify Quickstart, Doopify Troubleshooting, Server-Owned Checkout (+1 more)

### Community 128 - "ensure store mjs"
Cohesion: 0.22
Nodes (6): adapter, cwd, prisma, { PrismaClient }, { PrismaPg }, require

### Community 129 - "reset owner mjs"
Cohesion: 0.33
Nodes (8): __dirname, __filename, getPasswordSecurely(), main(), question(), repoRoot, rl, validateEmail()

### Community 130 - "route ts"
Cohesion: 0.44
Nodes (6): parseLimit(), POST(), mocks, getAbandonedCheckoutSecret(), isAbandonedCheckoutCronAuthorized(), sendDueRecoveryEmails()

### Community 131 - "route ts"
Cohesion: 0.36
Nodes (7): credentialMaskedValue(), credentialPresent(), GET(), mocks, toStripeProviderSnapshot(), listProviderStatuses(), ProviderStatus

### Community 133 - "job service test ts"
Cohesion: 0.25
Nodes (6): applyJobUpdate(), jobHandlerMocks, JobRecord, nowDate(), prismaMock, state

### Community 134 - "postgres media storage ts"
Cohesion: 0.33
Nodes (5): GetMediaObjectResult, MediaStorageAdapter, MediaStorageProvider, PutMediaObjectInput, PutMediaObjectResult

### Community 135 - "checkout service integration test ts"
Cohesion: 0.25
Nodes (4): address, createCheckoutSession(), mocks, seedDigitalCheckout()

### Community 136 - "isUniqueConstraintError Module"
Cohesion: 0.42
Nodes (8): isUniqueConstraintError(), resolveCheckoutCustomer(), addCustomerAddress(), createCustomer(), getCustomerByEmail(), normalizeEmail(), normalizeTags(), updateCustomer()

### Community 137 - "order notes service ts"
Cohesion: 0.33
Nodes (7): escapeHtml(), normalizeNote(), baseOrder, mocks, updateOrderNotes(), UpdateOrderNotesInput, getStoreSettingsLite()

### Community 138 - "smart promotions checkout spec ts"
Cohesion: 0.25
Nodes (4): CART_ITEMS, ensureScreenshotDir(), MockCheckoutPayload, screenshotPath()

### Community 139 - "Backup And Restore Recovery"
Cohesion: 0.32
Nodes (8): Backup And Restore Recovery, Admin User Recovery Guide, Backup And Restore, Environment Variable Reference, Production Runbook, Secret Rotation Runbook, Production Operations, Production Secret Rotation

### Community 140 - "route ts"
Cohesion: 0.39
Nodes (6): POST(), schema, mocks, beginOwnerMfaLoginChallenge(), ensureOwnerMfaGracePeriod(), shouldChallengeOwnerOnLogin()

### Community 141 - "route ts"
Cohesion: 0.32
Nodes (5): Params, POST(), mocks, DigitalDeliveryAdminServiceError, revokeDigitalDownloadGrant()

### Community 142 - "route ts"
Cohesion: 0.32
Nodes (6): EMAIL_DELIVERY_STATUS_FILTERS, GET(), parsePage(), statusSchema, templateSchema, mocks

### Community 143 - "route ts"
Cohesion: 0.39
Nodes (6): DELETE(), GET(), RouteContext, mocks, getUserSessions(), revokeUserSessions()

### Community 145 - "AdminCommandPalette tsx"
Cohesion: 0.46
Nodes (6): AdminCommandPalette(), isMacPlatform(), matchCommand(), AdminCommandGroup, AdminCommandItem, getAdminCommandGroups()

### Community 146 - "rowsToNameSummary Module"
Cohesion: 0.32
Nodes (8): rowsToNameSummary(), SmartPromotionFormSections(), buildPromotionPreview(), formatPromotionStatusLabel(), formatPromotionTypeLabel(), formatPromotionUpdatedLabel(), formatRewardSummary(), mapSmartPromotionListRow()

### Community 147 - "checkout loader service ts"
Cohesion: 0.36
Nodes (6): CheckoutPromotionLoaderSkip, isPhysicalFulfillment(), loadAutomaticPromotionsForCheckout(), LoadCheckoutPromotionsResult, requiresRewards(), mocks

### Community 148 - "credential readiness ts"
Cohesion: 0.46
Nodes (7): EXACT_PLACEHOLDERS, hasRealCredential(), isPlaceholderCredential(), normalizeCredential(), PLACEHOLDER_SUBSTRINGS, getEnvFallback(), trimToNull()

### Community 149 - "route ts"
Cohesion: 0.43
Nodes (5): GET(), Params, sanitizeAttachmentFileName(), mocks, toErrorResponse()

### Community 150 - "route ts"
Cohesion: 0.29
Nodes (5): Params, SAMPLE_VARS, sendTestSchema, SendEmailInput, SendEmailResult

### Community 151 - "route ts"
Cohesion: 0.48
Nodes (5): ALLOWED_TYPES, detectMimeType(), POST(), mocks, getMediaStorageAdapter()

### Community 152 - "route ts"
Cohesion: 0.43
Nodes (5): GET(), inviteSchema, POST(), mocks, listPendingInvites()

### Community 153 - "replay audit route test ts"
Cohesion: 0.29
Nodes (6): baseDelivery, mocks, RAW_PAYLOAD, replayAttempt, STAFF_ACTOR, STAFF_USER

### Community 156 - "PromotionVariantCommandPicker test tsx"
Cohesion: 0.33
Nodes (3): formatFulfillmentTypeLabel(), PromotionVariantSelectionList(), PromotionVariantSelectionListProps

### Community 157 - "Checkout Rates Versus Label Cost"
Cohesion: 0.33
Nodes (6): Checkout Rates Versus Label Cost, Live Rate Fallback, Shipping Delivery Settings Reference, Manual And Live Shipping Paths, Shipping Margin, Shipping Setup And Labels Roadmap

### Community 158 - "Outbound Merchant Webhooks"
Cohesion: 0.33
Nodes (6): Outbound Merchant Webhooks, Provider Webhook Separation, Compact Webhooks Settings Reference, Bounce Complaint Webhooks, Resend Setup Guide, Transactional Email Provider

### Community 159 - "Private Beta Gates"
Cohesion: 0.33
Nodes (6): Private Beta Gates, Public Beta Hardening, Release Blockers, Content Security Policy, Security Header Builder, Production Security Headers And CSP Plan

### Community 160 - "Official Stripe Node SDK"
Cohesion: 0.33
Nodes (6): Official Stripe Node SDK, Preserved Checkout Refund Webhook Behavior, Stripe SDK Migration Plan, Payment Intent Events, Stripe Setup Guide, Verified Stripe Webhook

### Community 161 - "Transactional Email Observability Plan"
Cohesion: 0.40
Nodes (6): Transactional Email Observability Plan, Email Delivery Records, Revenue Path Protection, Email Delivery Observability, Email Setup, Resend Provider

### Community 162 - "Production Deployment Checklist"
Cohesion: 0.33
Nodes (6): Production Deployment Checklist, Local Verification Gate, Production Secrets, Vercel Deployment Guide, Vercel Environment Variables, Neon Postgres on Vercel

### Community 163 - "Performance Audit Beta V2"
Cohesion: 0.33
Nodes (6): Performance Audit Beta V2, Regression Budget, Route Latency, Checkout Instrumentation, Beta V2 Timing Review, Route Timing

### Community 164 - "package json"
Cohesion: 0.33
Nodes (5): engines, node, name, private, version

### Community 165 - "run integration tests mjs"
Cohesion: 0.40
Nodes (4): hasRealCredential(), normalizeCredential(), prismaPgSchema, runEnv

### Community 166 - "route ts"
Cohesion: 0.47
Nodes (4): POST(), schema, mocks, acceptPasswordReset()

### Community 167 - "route ts"
Cohesion: 0.47
Nodes (4): POST(), RouteContext, mocks, requestPasswordReset()

### Community 168 - "AdminSavedState tsx"
Cohesion: 0.47
Nodes (5): AdminSavedState(), AdminSavedStateProps, buildClassName(), getStateCopy(), SavedState

### Community 169 - "cart fulfillment ts"
Cohesion: 0.53
Nodes (4): CartFulfillmentClassification, CartFulfillmentType, classifyCartFulfillment(), normalizeCartFulfillmentType()

### Community 170 - "Change Safety Checklist"
Cohesion: 0.40
Nodes (5): Change Safety Checklist, Verification Gate, Deployment Verification Gates, Recent Updates, Vercel Private Beta

### Community 171 - "prepare integration db mjs"
Cohesion: 0.40
Nodes (3): client, runEnv, schemaName

### Community 172 - "route ts"
Cohesion: 0.60
Nodes (3): GET(), mocks, getCheckoutStatus()

### Community 174 - "discountsData js"
Cohesion: 0.40
Nodes (3): DISCOUNT_METHODS, DISCOUNT_STATUSES, DISCOUNT_TYPES

### Community 175 - "listOrders ts"
Cohesion: 0.40
Nodes (3): FilterableOrder, OrderFilterOption, OrderListFilters

### Community 176 - "ui snapshots spec js"
Cohesion: 0.60
Nodes (4): collectMajorConsoleErrors(), isExpectedUnauth401ResourceError(), runSnapshotCases(), snapshotTargets

### Community 177 - "Event Architecture"
Cohesion: 0.67
Nodes (4): Event Architecture, Developer Features Roadmap, Event System and Integration Strategy, Typed Internal Event Dispatcher

### Community 178 - "Payments Settings Drawer Reference"
Cohesion: 0.50
Nodes (4): Payments Settings Drawer Reference, Security Controls, Doopify Security, Payment Provider Settings

### Community 179 - "Archived Doopify Launch Plan"
Cohesion: 0.50
Nodes (4): Archived Doopify Launch Plan, Archived Launch Rollout, Legacy Launch Rollout, Merchant Launch Readiness

### Community 181 - "seed mjs"
Cohesion: 0.67
Nodes (3): main(), prisma, toMinorUnit()

### Community 182 - "prisma js"
Cohesion: 0.67
Nodes (3): adapter, getPrismaAdapter(), normalizePgConnectionString()

### Community 183 - "queueOrderConfirmationEmailDelivery Module"
Cohesion: 0.67
Nodes (3): queueOrderConfirmationEmailDelivery(), sendOrderConfirmationEmail(), OrderConfirmationInput

### Community 184 - "Glass Admin UI System"
Cohesion: 0.67
Nodes (3): Glass Admin UI System, Reusable Admin Components, Doopify Admin UI Locked Concept

### Community 185 - "Glass Dashboard Tokens"
Cohesion: 0.67
Nodes (3): Glass Dashboard Tokens, Ocean Accent Theme, Doopify Glass Admin Mockup V7

### Community 186 - "Compact Action Drawers"
Cohesion: 0.67
Nodes (3): Compact Action Drawers, Provider-First Shipping Settings, Shipping Delivery Settings Design

### Community 187 - "Generic Audit Store"
Cohesion: 0.67
Nodes (3): Generic Audit Store, Audit Log Expansion Plan, Structured Audit Contract

### Community 188 - "AppShell Dependency"
Cohesion: 0.67
Nodes (3): AppShell Dependency, Legacy Component Consolidation, Component Consolidation Audit

### Community 189 - "Postgres Media Fallback"
Cohesion: 0.67
Nodes (3): Postgres Media Fallback, Media Object Storage Migration Plan, Storage Adapter Boundary

### Community 190 - "Neon Postgres Branch"
Cohesion: 0.67
Nodes (3): Neon Postgres Branch, Neon Setup Guide, SSL Verify Full

### Community 191 - "Sequenced Delivery Phases"
Cohesion: 0.67
Nodes (3): Sequenced Delivery Phases, Phase Completion Plan, Status Source Precedence

### Community 192 - "Conservative Audit Scope"
Cohesion: 0.67
Nodes (3): Conservative Audit Scope, Placeholder Classification, Production Hygiene Grep Audit

### Community 193 - "Browser Setup Boundary"
Cohesion: 0.67
Nodes (3): Browser Setup Boundary, Local Setup CLI, Setup Wizard And CLI Plan

### Community 194 - "Allow JS Compatibility"
Cohesion: 0.67
Nodes (3): Allow JS Compatibility, Checkout UI Conversion, TypeScript Conversion Plan

### Community 195 - "V7 Admin Component Guide"
Cohesion: 0.67
Nodes (3): V7 Admin Component Guide, Shared Admin Components, Dashboard Theme Tokens

### Community 196 - "Order Management Overhaul Plan"
Cohesion: 0.67
Nodes (3): Order Management Overhaul Plan, Archived Doopify Roadmap, Order Management Lifecycle

### Community 197 - "Local Database Bootstrap"
Cohesion: 0.67
Nodes (3): Local Database Bootstrap, Local Deployment Guide, Local Environment Configuration

### Community 198 - "Digital Products Runbook"
Cohesion: 0.67
Nodes (3): Digital Products Runbook, Digital Entitlement Delivery, Signed Downloads

### Community 199 - "Merchant Launch Guide"
Cohesion: 0.67
Nodes (3): Merchant Launch Guide, Order Support Operations, Store Readiness

### Community 200 - "Beta V2 Merge Readiness"
Cohesion: 0.67
Nodes (3): Beta V2 Merge Readiness, Merge Risk, Verification Matrix

### Community 201 - "First Owner Setup"
Cohesion: 0.67
Nodes (3): First Owner Setup, Owner Creation, Setup Token

### Community 202 - "Doopify Shopping Bag Icon"
Cohesion: 0.67
Nodes (3): Doopify Shopping Bag Icon, Wireless Headphones Product Image, Wireless Earbuds Product Image

## Knowledge Gaps
- **1189 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+1184 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `err()` connect `route ts` to `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `POST Module`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `ok()` connect `route ts` to `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `POST Module`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`, `route ts`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Why does `centsToDollars()` connect `route ts` to `route ts`, `markCheckoutRecoveredByPaymentIntent Module`, `route ts`, `route ts`, `route ts`, `StorefrontLayout Module`, `route ts`, `route ts`, `admin order detail service ts`, `POST Module`, `route ts`, `route ts`, `route ts`, `layout js`, `toStorefrontProduct Module`, `route ts`, `route ts`, `pricing ts`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _1205 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `route ts` be split into smaller, more focused modules?**
  _Cohesion score 0.03755868544600939 - nodes in this community are weakly interconnected._
- **Should `page js` be split into smaller, more focused modules?**
  _Cohesion score 0.0352233676975945 - nodes in this community are weakly interconnected._
- **Should `route ts` be split into smaller, more focused modules?**
  _Cohesion score 0.03464912280701754 - nodes in this community are weakly interconnected._