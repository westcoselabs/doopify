"use client";

import { useMemo, useState } from 'react';
import AdminButton from '../admin/ui/AdminButton';
import AdminSelect from '../admin/ui/AdminSelect';
import { useProductStore } from '../../context/ProductContext';
import styles from './ProductVariantEditor.module.css';

const DEFAULT_OPTION_SUGGESTIONS = {
  Size: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
  Color: ['Black', 'White', 'Blue', 'Red', 'Green'],
  Material: ['Cotton', 'Wool', 'Leather'],
  Style: ['Classic', 'Modern'],
};

const WEIGHT_UNIT_OPTIONS = ['g', 'kg', 'oz', 'lb'];
const WEIGHT_UNIT_SELECT_OPTIONS = WEIGHT_UNIT_OPTIONS.map(unit => ({ value: unit, label: unit }));

function WeightUnitSelect({ ariaLabel, onChange, value }) {
  return (
    <AdminSelect
      ariaLabel={ariaLabel}
      className={styles.weightUnitSelect}
      onChange={onChange}
      options={WEIGHT_UNIT_SELECT_OPTIONS}
      value={value || 'kg'}
    />
  );
}

function OptionEditor({ option, actions, errorMessage }) {
  const [draftValue, setDraftValue] = useState('');
  const suggestions = DEFAULT_OPTION_SUGGESTIONS[option.name] || [];

  const submitValue = value => {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return;
    }

    actions.addOptionValue(option.id, normalizedValue);
    setDraftValue('');
  };

  return (
    <div className={styles.optionCard}>
      <div className={styles.optionDragHandle}>
        <span className="material-symbols-outlined">drag_indicator</span>
      </div>

      <div className={styles.optionBody}>
        <div className={styles.optionNameLabel}>Option name</div>
        <input
          aria-label="Option name"
          className={errorMessage ? `${styles.optionNameInput} ${styles.optionNameInputError}` : styles.optionNameInput}
          onChange={event => actions.updateOptionName(option.id, event.target.value)}
          placeholder="Size"
          type="text"
          value={option.name}
        />
        {errorMessage ? <p className={styles.optionError}>{errorMessage}</p> : null}

        <div className={styles.valueComposer}>
          <div className={styles.optionChipRow}>
            {option.values.map(value => (
              <button
                key={`${option.id}-${value}`}
                className={styles.optionChip}
                onClick={() => actions.removeOptionValue(option.id, value)}
                type="button"
              >
                <span>{value}</span>
                <span className="material-symbols-outlined">close</span>
              </button>
            ))}
            <input
              className={styles.valueInput}
              onChange={event => setDraftValue(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault();
                  submitValue(draftValue);
                }
              }}
              placeholder={`Add ${option.name.toLowerCase() || 'value'}`}
              type="text"
              value={draftValue}
            />
          </div>

          {suggestions.length ? (
            <div className={styles.suggestionList}>
              <p className={styles.suggestionTitle}>Default entries</p>
              <div className={styles.suggestionGrid}>
                {suggestions.map(suggestion => {
                  const isSelected = option.values.includes(suggestion);
                  return (
                    <label key={`${option.id}-${suggestion}`} className={styles.suggestionItem}>
                      <input
                        checked={isSelected}
                        onChange={event => {
                          if (event.target.checked) {
                            actions.addOptionValue(option.id, suggestion);
                          } else {
                            actions.removeOptionValue(option.id, suggestion);
                          }
                        }}
                        type="checkbox"
                      />
                      <span>{suggestion}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className={styles.optionFooter}>
            <AdminButton className={styles.deleteOptionButton} onClick={() => actions.removeOptionGroup(option.id)} size="sm" variant="danger">
              Delete
            </AdminButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupedVariantRows({ draftProduct, actions, formatMoney, variantRowErrors }) {
  const [expandedGroupKey, setExpandedGroupKey] = useState(null);
  const primaryOption = draftProduct.options[0];
  const secondaryOption = draftProduct.options[1];
  const grouped = primaryOption
    ? primaryOption.values.map(value => {
        const variants = draftProduct.variants.filter(variant => variant.optionValues?.[primaryOption.name] === value);
        return {
          key: value,
          label: value,
          variants,
        };
      })
    : [];

  return (
    <>
      {grouped.map(group => {
        const totalAvailable = group.variants.reduce((sum, variant) => sum + (Number.parseInt(variant.inventoryQty, 10) || 0), 0);
        const continueSellingCount = group.variants.filter(variant => variant.continueSellingWhenOutOfStock).length;
        const groupPrice = group.variants[0]?.price || draftProduct.basePrice;
        const isExpanded = expandedGroupKey === group.key;

        return (
          <div key={group.key} className={styles.groupBlock}>
            <div className={styles.groupRow}>
              <div className={styles.checkboxColumn}>
                <input type="checkbox" />
              </div>
              <button className={styles.groupIdentityCell} onClick={() => setExpandedGroupKey(isExpanded ? null : group.key)} type="button">
                <div className={styles.variantThumbPlaceholder}>
                  <span className="material-symbols-outlined">add_photo_alternate</span>
                </div>
                <div className={styles.variantIdentityText}>
                  <div className={styles.variantName}>{group.label}</div>
                  <div className={styles.groupMeta}>
                    {group.variants.length} variant{group.variants.length > 1 ? 's' : ''}
                    <span className="material-symbols-outlined">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                  </div>
                </div>
              </button>
              <div className={styles.variantSkuCell}>
                <span className={styles.mutedText}>Multiple SKUs</span>
              </div>
              <div className={styles.variantPriceCell}>
                <div className={styles.currencyInputWrap}>
                  <span className={styles.currencyPrefix}>$</span>
                  <input className={styles.priceInput} readOnly type="text" value={groupPrice} />
                </div>
                <small className={styles.secondaryLine}>{formatMoney(groupPrice)}</small>
              </div>
              <div className={styles.variantInventoryCell}>
                <input className={styles.inventoryInput} readOnly type="number" value={totalAvailable} />
              </div>
              <div className={styles.continueSellingCell}>
                <span className={styles.mutedText}>
                  {continueSellingCount > 0
                    ? `${continueSellingCount} variant${continueSellingCount > 1 ? 's' : ''} on`
                    : 'All off'}
                </span>
              </div>
              <div className={styles.weightCell}>
                <span className={styles.mutedText}>Mixed</span>
              </div>
            </div>

            {isExpanded && secondaryOption ? (
              <div className={styles.subRowList}>
                {group.variants.map(variant => (
                  <div key={variant.id} className={styles.subVariantRow}>
                    {(() => {
                      const rowErrors = variantRowErrors?.[variant.id] || {};
                      return (
                        <>
                    <div className={styles.checkboxColumn}>
                      <input type="checkbox" />
                    </div>
                    <div className={styles.subVariantIdentity}>
                      <div className={styles.subVariantSpacer} />
                      <div className={styles.variantIdentityText}>
                        <div className={styles.variantName}>{variant.optionValues?.[secondaryOption.name] || variant.title}</div>
                        {rowErrors.optionValues ? <p className={styles.fieldErrorText}>{rowErrors.optionValues}</p> : null}
                      </div>
                      <AdminButton className={styles.deleteVariantButton} onClick={() => actions.requestDeleteVariant(variant.id)} size="sm" variant="danger">
                        Delete
                      </AdminButton>
                    </div>
                    <div className={styles.variantSkuCell}>
                      <input
                        className={rowErrors.sku ? `${styles.skuInput} ${styles.inputError}` : styles.skuInput}
                        onChange={event => actions.updateVariantField(variant.id, 'sku', event.target.value)}
                        placeholder="SKU"
                        type="text"
                        value={variant.sku}
                      />
                      {rowErrors.sku ? <p className={styles.fieldErrorText}>{rowErrors.sku}</p> : null}
                    </div>
                    <div className={styles.variantPriceCell}>
                      <div className={styles.currencyInputWrap}>
                        <span className={styles.currencyPrefix}>$</span>
                        <input
                          className={rowErrors.price || rowErrors.compareAtPrice ? `${styles.priceInput} ${styles.inputError}` : styles.priceInput}
                          onChange={event => actions.updateVariantField(variant.id, 'price', event.target.value)}
                          type="text"
                          value={variant.price}
                        />
                      </div>
                      {rowErrors.price ? <p className={styles.fieldErrorText}>{rowErrors.price}</p> : null}
                      {rowErrors.compareAtPrice ? <p className={styles.fieldErrorText}>{rowErrors.compareAtPrice}</p> : null}
                    </div>
                    <div className={styles.variantInventoryCell}>
                      <input
                        aria-label={`Quantity available for ${variant.title || 'variant'}`}
                        className={rowErrors.inventoryQty ? `${styles.inventoryInput} ${styles.inputError}` : styles.inventoryInput}
                        min="0"
                        onChange={event => actions.updateVariantField(variant.id, 'inventoryQty', event.target.value)}
                        type="number"
                        value={variant.inventoryQty}
                      />
                      {rowErrors.inventoryQty ? <p className={styles.fieldErrorText}>{rowErrors.inventoryQty}</p> : null}
                    </div>

                    <div className={styles.continueSellingCell}>
                      <div className={styles.continueSellingInline}>
                        <ContinueSellingToggle
                          ariaLabel={`Continue selling when out of stock for ${variant.title || 'variant'}`}
                          checked={Boolean(variant.continueSellingWhenOutOfStock)}
                          onToggle={() =>
                            actions.updateVariantField(
                              variant.id,
                              'continueSellingWhenOutOfStock',
                              !variant.continueSellingWhenOutOfStock
                            )
                          }
                        />
                        <span>{variant.continueSellingWhenOutOfStock ? 'On' : 'Off'}</span>
                      </div>
                    </div>

                    <div className={styles.weightCell}>
                      <div className={styles.weightInputWrap}>
                        <input
                          aria-label={`Weight for ${variant.title || 'variant'}`}
                          className={`admin-input ${styles.weightInput}`}
                          min="0"
                          onChange={event => actions.updateVariantField(variant.id, 'weight', event.target.value === '' ? null : Number(event.target.value))}
                          placeholder="0"
                          step="0.01"
                          type="number"
                          value={variant.weight ?? ''}
                        />
                        <WeightUnitSelect
                          ariaLabel={`Weight unit for ${variant.title || 'variant'}`}
                          onChange={nextValue => actions.updateVariantField(variant.id, 'weightUnit', nextValue)}
                          value={variant.weightUnit || 'kg'}
                        />
                      </div>
                    </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function BasicInventoryCard({ draftProduct, actions }) {
  const baseVariant = draftProduct.variants[0];
  const inventoryQty = baseVariant?.inventoryQty ?? 0;
  const continueSelling = Boolean(baseVariant?.continueSellingWhenOutOfStock);
  const weight = baseVariant?.weight ?? '';
  const weightUnit = baseVariant?.weightUnit || 'kg';
  const quantityInputId = baseVariant?.id ? `default-variant-quantity-${baseVariant.id}` : 'default-variant-quantity';
  const weightInputId = baseVariant?.id ? `default-variant-weight-${baseVariant.id}` : 'default-variant-weight';

  return (
    <div className={styles.basicInventoryCard}>
      <div className={styles.basicInventoryHeader}>
        <h4 className={styles.basicInventoryTitle}>Default variant details</h4>
        <span className={styles.inventoryTrackingPill}>Inventory tracking enabled</span>
      </div>

      <div className={styles.basicInventorySections}>
        <section className={styles.basicInfoSection} aria-label="Inventory">
          <h5 className={styles.basicInfoSectionTitle}>Inventory</h5>
          <label className={styles.basicFieldLabel} htmlFor={quantityInputId}>Quantity available</label>
          <input
            id={quantityInputId}
            aria-label="Quantity available"
            className={styles.inventoryInput}
            min="0"
            onChange={event => actions.updateVariantField(baseVariant.id, 'inventoryQty', event.target.value)}
            type="number"
            value={inventoryQty}
          />
          <div className={styles.continueSellingBlock}>
            <div className={styles.continueSellingCopy}>
              <strong>Continue selling when out of stock</strong>
              <span>Allows checkout after this variant reaches zero.</span>
            </div>
            <ContinueSellingToggle
              ariaLabel="Continue selling when out of stock"
              checked={continueSelling}
              onToggle={() =>
                actions.updateVariantField(
                  baseVariant.id,
                  'continueSellingWhenOutOfStock',
                  !continueSelling
                )
              }
            />
          </div>
          <p className={styles.basicFieldHelp}>
            {continueSelling
              ? 'Enabled. This variant can keep selling after quantity reaches zero.'
              : 'Disabled. Checkout will stop when this variant reaches zero.'}
          </p>
        </section>

        <section className={styles.basicInfoSection} aria-label="Shipping">
          <h5 className={styles.basicInfoSectionTitle}>Shipping</h5>
          <label className={styles.basicFieldLabel} htmlFor={weightInputId}>Weight</label>
          <div className={styles.weightInputWrap}>
            <input
              id={weightInputId}
              aria-label="Weight"
              className={`admin-input ${styles.weightInput}`}
              min="0"
              onChange={event => actions.updateVariantField(baseVariant.id, 'weight', event.target.value === '' ? null : Number(event.target.value))}
              placeholder="0"
              step="0.01"
              type="number"
              value={weight ?? ''}
            />
            <WeightUnitSelect
              ariaLabel="Weight unit for default variant"
              onChange={nextValue => actions.updateVariantField(baseVariant.id, 'weightUnit', nextValue)}
              value={weightUnit}
            />
          </div>
          <p className={styles.basicFieldHelp}>Used for shipping rates and label calculations.</p>
        </section>
      </div>
    </div>
  );
}

function ContinueSellingToggle({ ariaLabel, checked, onToggle }) {
  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={checked}
      className={`${styles.continueToggle} ${checked ? styles.continueToggleOn : ''}`}
      onClick={onToggle}
      type="button"
    >
      <span className={styles.continueToggleHandle} />
    </button>
  );
}

function DefaultVariantCard({ actions }) {
  return (
    <div className={styles.defaultVariantCard}>
      <div className={styles.defaultVariantHeader}>
        <h5 className={styles.defaultVariantTitle}>Default variant</h5>
        <p className={styles.defaultVariantBody}>
          This product has one default variant. Add options like Size, Color, or Material only if this product comes in multiple versions.
        </p>
      </div>
      <AdminButton
        className={styles.defaultVariantAction}
        leftIcon={<span className="material-symbols-outlined">add_circle</span>}
        onClick={() => actions.addOptionGroup()}
        size="sm"
        variant="secondary"
      >
        Add option
      </AdminButton>
    </div>
  );
}

export default function ProductVariantEditor() {
  const { editor, actions, formatMoney } = useProductStore();
  const draftProduct = editor.draftProduct;
  const variantRowErrors = editor.validationErrors.variantRows || {};
  const optionErrorMessage = editor.validationErrors.options || '';
  const totalInventory = useMemo(
    () => draftProduct?.variants?.reduce((sum, variant) => sum + (Number.parseInt(variant.inventoryQty, 10) || 0), 0) || 0,
    [draftProduct]
  );

  if (!draftProduct) {
    return null;
  }

  const hasRealVariants = draftProduct.options.length > 0;
  const canGroupVariants = draftProduct.options.length > 1;

  return (
    <div className={styles.variantShell}>
      <div className={styles.variantHeaderRow}>
        <h4 className={styles.variantSectionTitle}>Variants</h4>
        <AdminButton className={styles.addVariantButton} leftIcon={<span className="material-symbols-outlined">add</span>} onClick={() => actions.addVariant()} size="sm" variant="primary">
          Add variant
        </AdminButton>
      </div>

      <div className={styles.optionPanel}>
        {draftProduct.options.length ? (
          draftProduct.options.map(option => (
            <OptionEditor
              key={option.id}
              option={option}
              actions={actions}
              errorMessage={optionErrorMessage}
            />
          ))
        ) : (
          <DefaultVariantCard actions={actions} />
        )}

        {draftProduct.options.length ? (
          <AdminButton className={styles.addOptionLink} leftIcon={<span className="material-symbols-outlined">add_circle</span>} onClick={() => actions.addOptionGroup()} size="sm" variant="secondary">
            Add another option
          </AdminButton>
        ) : null}
      </div>

      {editor.validationErrors.options && !draftProduct.options.some(option => editor.validationErrors.options?.includes(option.name)) ? (
        <p className={styles.errorText}>{editor.validationErrors.options}</p>
      ) : null}
      {editor.validationErrors.variants && !Object.keys(variantRowErrors).length ? (
        <p className={styles.errorText}>{editor.validationErrors.variants}</p>
      ) : null}

      {hasRealVariants ? (
        <>
          <div className={styles.matrixTools}>
            {canGroupVariants ? <div className={styles.groupByChip}>Group by {draftProduct.options[0].name}</div> : null}
            <AdminButton className={styles.matrixToolButton} size="sm" variant="secondary">
              <span className="material-symbols-outlined">search</span>
            </AdminButton>
            <AdminButton className={styles.matrixToolButton} size="sm" variant="secondary">
              <span className="material-symbols-outlined">filter_list</span>
            </AdminButton>
          </div>

          <div className={styles.matrixWrap}>
            <div className={styles.matrixHeader}>
              <div className={styles.checkboxColumn}><input type="checkbox" /></div>
              <div className={styles.variantColumn}>Variant</div>
              <div className={styles.skuColumn}>SKU</div>
              <div className={styles.priceColumn}>Price</div>
              <div className={styles.inventoryColumn}>Available</div>
              <div className={styles.continueSellingColumn}>Continue selling</div>
              <div className={styles.weightColumn}>Weight</div>
            </div>

            <div className={styles.matrixBody}>
              {canGroupVariants ? (
                <GroupedVariantRows draftProduct={draftProduct} actions={actions} formatMoney={formatMoney} variantRowErrors={variantRowErrors} />
              ) : (
                draftProduct.variants.map(variant => (
                  <div key={variant.id} className={styles.variantRow}>
                    {(() => {
                      const rowErrors = variantRowErrors?.[variant.id] || {};
                      return (
                        <>
                    <div className={styles.checkboxColumn}>
                      <input type="checkbox" />
                    </div>

                    <div className={styles.variantIdentityCell}>
                      <div className={styles.variantThumbPlaceholder}>
                        <span className="material-symbols-outlined">add_photo_alternate</span>
                      </div>
                      <div className={styles.variantIdentityText}>
                        <div className={styles.variantName}>{variant.title}</div>
                        {rowErrors.optionValues ? <p className={styles.fieldErrorText}>{rowErrors.optionValues}</p> : null}
                      </div>
                      <AdminButton className={styles.deleteVariantButton} onClick={() => actions.requestDeleteVariant(variant.id)} size="sm" variant="danger">
                        Delete
                      </AdminButton>
                    </div>
                    <div className={styles.variantSkuCell}>
                      <input
                        className={rowErrors.sku ? `${styles.skuInput} ${styles.inputError}` : styles.skuInput}
                        onChange={event => actions.updateVariantField(variant.id, 'sku', event.target.value)}
                        placeholder="SKU"
                        type="text"
                        value={variant.sku}
                      />
                      {rowErrors.sku ? <p className={styles.fieldErrorText}>{rowErrors.sku}</p> : null}
                    </div>

                    <div className={styles.variantPriceCell}>
                      <div className={styles.currencyInputWrap}>
                        <span className={styles.currencyPrefix}>$</span>
                        <input
                          className={rowErrors.price || rowErrors.compareAtPrice ? `${styles.priceInput} ${styles.inputError}` : styles.priceInput}
                          onChange={event => actions.updateVariantField(variant.id, 'price', event.target.value)}
                          type="text"
                          value={variant.price}
                        />
                      </div>
                      {rowErrors.price ? <p className={styles.fieldErrorText}>{rowErrors.price}</p> : null}
                      {rowErrors.compareAtPrice ? <p className={styles.fieldErrorText}>{rowErrors.compareAtPrice}</p> : null}
                      <small className={styles.secondaryLine}>{formatMoney(variant.price)}</small>
                    </div>

                    <div className={styles.variantInventoryCell}>
                      <input
                        aria-label={`Quantity available for ${variant.title || 'variant'}`}
                        className={rowErrors.inventoryQty ? `${styles.inventoryInput} ${styles.inputError}` : styles.inventoryInput}
                        min="0"
                        onChange={event => actions.updateVariantField(variant.id, 'inventoryQty', event.target.value)}
                        type="number"
                        value={variant.inventoryQty}
                      />
                      {rowErrors.inventoryQty ? <p className={styles.fieldErrorText}>{rowErrors.inventoryQty}</p> : null}
                    </div>

                    <div className={styles.continueSellingCell}>
                      <div className={styles.continueSellingInline}>
                        <ContinueSellingToggle
                          ariaLabel={`Continue selling when out of stock for ${variant.title || 'variant'}`}
                          checked={Boolean(variant.continueSellingWhenOutOfStock)}
                          onToggle={() =>
                            actions.updateVariantField(
                              variant.id,
                              'continueSellingWhenOutOfStock',
                              !variant.continueSellingWhenOutOfStock
                            )
                          }
                        />
                        <span>{variant.continueSellingWhenOutOfStock ? 'On' : 'Off'}</span>
                      </div>
                    </div>

                    <div className={styles.weightCell}>
                      <div className={styles.weightInputWrap}>
                        <input
                          aria-label={`Weight for ${variant.title || 'variant'}`}
                          className={`admin-input ${styles.weightInput}`}
                          min="0"
                          onChange={event => actions.updateVariantField(variant.id, 'weight', event.target.value === '' ? null : Number(event.target.value))}
                          placeholder="0"
                          step="0.01"
                          type="number"
                          value={variant.weight ?? ''}
                        />
                        <WeightUnitSelect
                          ariaLabel={`Weight unit for ${variant.title || 'variant'}`}
                          onChange={nextValue => actions.updateVariantField(variant.id, 'weightUnit', nextValue)}
                          value={variant.weightUnit || 'kg'}
                        />
                      </div>
                    </div>
                        </>
                      );
                    })()}
                  </div>
                ))
              )}
            </div>

            <div className={styles.matrixFooter}>Total inventory available: {totalInventory}</div>
          </div>
        </>
      ) : (
        <BasicInventoryCard draftProduct={draftProduct} actions={actions} />
      )}
    </div>
  );
}
