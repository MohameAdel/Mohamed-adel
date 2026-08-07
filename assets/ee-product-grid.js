(() => {
  const ELEMENT_NAME = 'ee-test-product-grid';

  if (customElements.get(ELEMENT_NAME)) {
    return;
  }

  class EETestProductGrid extends HTMLElement {
    connectedCallback() {
      this.cleanupListeners();

      this.controller = new AbortController();
      this.signal = this.controller.signal;

      this.modal = this.querySelector('[data-ee-test-modal]');
      this.dialog = this.querySelector('[data-ee-test-dialog]');
      this.backdrop = this.querySelector('[data-ee-test-modal-backdrop]');
      this.closeButton = this.querySelector('[data-ee-test-modal-close]');

      this.image = this.querySelector('[data-ee-test-popup-image]');
      this.title = this.querySelector('[data-ee-test-popup-title]');
      this.price = this.querySelector('[data-ee-test-popup-price]');
      this.comparePrice = this.querySelector(
        '[data-ee-test-popup-compare-price]'
      );
      this.description = this.querySelector(
        '[data-ee-test-popup-description]'
      );
      this.optionsContainer = this.querySelector('[data-ee-test-options]');
      this.availability = this.querySelector(
        '[data-ee-test-availability]'
      );
      this.addButton = this.querySelector('[data-ee-test-add-button]');
      this.status = this.querySelector('[data-ee-test-status]');

      this.products = new Map();
      this.activeProduct = null;
      this.activeVariant = null;
      this.activeTrigger = null;
      this.selectedOptions = [];
      this.isSubmitting = false;
      this.isOpen = false;
      this.successTimer = null;
      this.previousBodyOverflow = '';

      this.readProductData();
      this.bindEvents();
    }

    disconnectedCallback() {
      if (this.isOpen) {
        this.closeModal(false);
      }

      this.cleanupListeners();

      if (this.successTimer) {
        window.clearTimeout(this.successTimer);
        this.successTimer = null;
      }
    }

    cleanupListeners() {
      if (this.controller) {
        this.controller.abort();
        this.controller = null;
      }
    }

    readProductData() {
      const dataElement = this.querySelector('[data-ee-test-products]');

      if (!dataElement) {
        return;
      }

      try {
        const parsedData = JSON.parse(dataElement.textContent);

        if (!parsedData || !Array.isArray(parsedData.products)) {
          return;
        }

        parsedData.products.forEach((product) => {
          if (product && product.blockId) {
            this.products.set(String(product.blockId), product);
          }
        });
      } catch (error) {
        console.error('EE product grid: invalid product JSON.', error);
      }
    }

    bindEvents() {
      this.addEventListener(
        'click',
        (event) => this.handleClick(event),
        { signal: this.signal }
      );

      this.addEventListener(
        'change',
        (event) => this.handleChange(event),
        { signal: this.signal }
      );

      document.addEventListener(
        'keydown',
        (event) => this.handleDocumentKeydown(event),
        { signal: this.signal }
      );
    }

    handleClick(event) {
      const hotspot = event.target.closest('[data-ee-test-hotspot]');

      if (hotspot && this.contains(hotspot)) {
        const blockId = hotspot.dataset.blockId;
        const product = this.products.get(String(blockId));

        if (product) {
          this.openModal(product, hotspot);
        }

        return;
      }

      const optionButton = event.target.closest(
        '[data-ee-test-option-button]'
      );

      if (
        optionButton &&
        this.optionsContainer &&
        this.optionsContainer.contains(optionButton)
      ) {
        const optionIndex = Number(optionButton.dataset.optionIndex);
        const optionValue = optionButton.dataset.optionValue;

        if (
          Number.isInteger(optionIndex) &&
          typeof optionValue === 'string'
        ) {
          this.selectedOptions[optionIndex] = optionValue;
          this.updateOptionButtonStates(optionIndex);
          this.updateVariant();
        }

        return;
      }

      if (
        event.target.closest('[data-ee-test-modal-close]') &&
        this.isOpen
      ) {
        this.closeModal(true);
        return;
      }

      if (event.target === this.backdrop && this.isOpen) {
        this.closeModal(true);
        return;
      }

      if (
        event.target.closest('[data-ee-test-add-button]') &&
        this.isOpen
      ) {
        this.addToCart();
      }
    }

    handleChange(event) {
      const select = event.target.closest('[data-ee-test-option-select]');

      if (
        !select ||
        !this.optionsContainer ||
        !this.optionsContainer.contains(select)
      ) {
        return;
      }

      const optionIndex = Number(select.dataset.optionIndex);

      if (!Number.isInteger(optionIndex)) {
        return;
      }

      this.selectedOptions[optionIndex] = select.value;
      this.updateVariant();
    }

    handleDocumentKeydown(event) {
      if (!this.isOpen) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeModal(true);
        return;
      }

      if (event.key === 'Tab') {
        this.trapFocus(event);
      }
    }

    openModal(product, trigger) {
      if (!this.modal || !this.dialog) {
        return;
      }

      if (this.successTimer) {
        window.clearTimeout(this.successTimer);
        this.successTimer = null;
      }

      this.activeProduct = product;
      this.activeTrigger = trigger;
      this.isSubmitting = false;

      const defaultVariant =
        product.variants.find(
          (variant) => variant.id === product.defaultVariantId
        ) ||
        product.variants.find((variant) => variant.available) ||
        product.variants[0] ||
        null;

      if (defaultVariant) {
        this.selectedOptions = [...defaultVariant.options];
      } else {
        this.selectedOptions = product.options.map(
          (option) => option.values[0] || ''
        );
      }

      this.title.textContent = product.title || '';
      this.description.textContent = product.description || '';
      this.status.textContent = '';

      this.updateImage(product.featuredImage);
      this.renderOptions();
      this.updateVariant();

      this.modal.hidden = false;
      this.isOpen = true;
      this.lockBody();

      window.requestAnimationFrame(() => {
        if (this.closeButton) {
          this.closeButton.focus();
        }
      });
    }

    closeModal(restoreFocus = true) {
      if (!this.modal) {
        return;
      }

      this.modal.hidden = true;
      this.isOpen = false;
      this.isSubmitting = false;

      this.unlockBody();

      if (
        restoreFocus &&
        this.activeTrigger &&
        this.activeTrigger.isConnected
      ) {
        this.activeTrigger.focus();
      }

      this.activeProduct = null;
      this.activeVariant = null;
      this.activeTrigger = null;
      this.selectedOptions = [];

      if (this.status) {
        this.status.textContent = '';
      }
    }

    renderOptions() {
      if (!this.optionsContainer || !this.activeProduct) {
        return;
      }

      this.optionsContainer.replaceChildren();

      this.activeProduct.options.forEach((option, optionIndex) => {
        if (optionIndex === 0) {
          this.renderFirstOption(option, optionIndex);
        } else {
          this.renderSelectOption(option, optionIndex);
        }
      });
    }

    renderFirstOption(option, optionIndex) {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'ee-test-product-grid__option-group';

      const legend = document.createElement('legend');
      legend.className = 'ee-test-product-grid__option-legend';
      legend.textContent = option.name;

      const buttonContainer = document.createElement('div');
      buttonContainer.className =
        'ee-test-product-grid__option-buttons';

      option.values.forEach((value) => {
        const button = document.createElement('button');

        button.type = 'button';
        button.className = 'ee-test-product-grid__option-button';
        button.dataset.eeTestOptionButton = '';
        button.dataset.optionIndex = String(optionIndex);
        button.dataset.optionValue = String(value);
        button.textContent = String(value);

        const selected =
          String(this.selectedOptions[optionIndex]) === String(value);

        button.setAttribute(
          'aria-pressed',
          selected ? 'true' : 'false'
        );

        buttonContainer.appendChild(button);
      });

      fieldset.appendChild(legend);
      fieldset.appendChild(buttonContainer);

      this.optionsContainer.appendChild(fieldset);
    }

    renderSelectOption(option, optionIndex) {
      const wrapper = document.createElement('div');
      wrapper.className = 'ee-test-product-grid__option-group';

      const label = document.createElement('label');
      const select = document.createElement('select');

      const selectId = [
        'ee-test-option',
        this.dataset.sectionId || 'section',
        optionIndex
      ].join('-');

      label.className = 'ee-test-product-grid__select-label';
      label.htmlFor = selectId;
      label.textContent = option.name;

      select.id = selectId;
      select.className = 'ee-test-product-grid__select';
      select.dataset.eeTestOptionSelect = '';
      select.dataset.optionIndex = String(optionIndex);

      option.values.forEach((value) => {
        const optionElement = document.createElement('option');

        optionElement.value = String(value);
        optionElement.textContent = String(value);

        if (
          String(this.selectedOptions[optionIndex]) === String(value)
        ) {
          optionElement.selected = true;
        }

        select.appendChild(optionElement);
      });

      wrapper.appendChild(label);
      wrapper.appendChild(select);

      this.optionsContainer.appendChild(wrapper);
    }

    updateOptionButtonStates(optionIndex) {
      if (!this.optionsContainer) {
        return;
      }

      const buttons = this.optionsContainer.querySelectorAll(
        `[data-ee-test-option-button][data-option-index="${optionIndex}"]`
      );

      buttons.forEach((button) => {
        const selected =
          String(button.dataset.optionValue) ===
          String(this.selectedOptions[optionIndex]);

        button.setAttribute(
          'aria-pressed',
          selected ? 'true' : 'false'
        );
      });
    }

    findSelectedVariant() {
      if (!this.activeProduct) {
        return null;
      }

      return (
        this.activeProduct.variants.find((variant) => {
          if (
            !Array.isArray(variant.options) ||
            variant.options.length !== this.selectedOptions.length
          ) {
            return false;
          }

          return variant.options.every((value, index) => {
            return (
              String(value) === String(this.selectedOptions[index])
            );
          });
        }) || null
      );
    }

    updateVariant() {
      if (!this.activeProduct) {
        return;
      }

      const variant = this.findSelectedVariant();
      this.activeVariant = variant;

      this.updateAllOptionStates();

      if (!variant) {
        this.price.textContent = 'Unavailable';

        this.comparePrice.textContent = '';
        this.comparePrice.hidden = true;

        this.availability.textContent =
          'This option combination is unavailable.';

        this.addButton.disabled = true;
        this.addButton.textContent = 'Unavailable';

        this.updateImage(this.activeProduct.featuredImage);
        return;
      }

      this.price.textContent = variant.priceFormatted || '';

      if (
        variant.compareAtPrice &&
        variant.compareAtPrice > variant.price &&
        variant.compareAtPriceFormatted
      ) {
        this.comparePrice.textContent =
          variant.compareAtPriceFormatted;
        this.comparePrice.hidden = false;
      } else {
        this.comparePrice.textContent = '';
        this.comparePrice.hidden = true;
      }

      if (variant.image) {
        this.updateImage(variant.image);
      } else {
        this.updateImage(this.activeProduct.featuredImage);
      }

      if (variant.available) {
        this.availability.textContent = 'In stock';
        this.addButton.disabled = this.isSubmitting;

        if (!this.isSubmitting) {
          this.addButton.textContent = 'Add to cart';
        }
      } else {
        this.availability.textContent = 'Sold out';
        this.addButton.disabled = true;
        this.addButton.textContent = 'Sold out';
      }
    }

    updateAllOptionStates() {
      if (!this.optionsContainer) {
        return;
      }

      this.activeProduct.options.forEach((option, index) => {
        if (index === 0) {
          this.updateOptionButtonStates(index);
        }
      });
    }

    updateImage(imageData) {
      if (!this.image) {
        return;
      }

      if (!imageData || !imageData.src) {
        this.image.removeAttribute('src');
        this.image.alt = '';
        return;
      }

      this.image.src = imageData.src;
      this.image.alt =
        imageData.alt ||
        (this.activeProduct ? this.activeProduct.title : '');

      if (imageData.width) {
        this.image.width = Number(imageData.width);
      }

      if (imageData.height) {
        this.image.height = Number(imageData.height);
      }
    }

    async addToCart() {
      const variant = this.activeVariant;

      if (
        !variant ||
        !variant.available ||
        this.isSubmitting ||
        !this.addButton
      ) {
        return;
      }

      this.isSubmitting = true;
      this.addButton.disabled = true;
      this.addButton.textContent = 'Adding…';
      this.status.textContent = 'Adding item to cart…';

      let requestSucceeded = false;

      try {
        const shopifyRoot =
          window.Shopify &&
          window.Shopify.routes &&
          window.Shopify.routes.root
            ? window.Shopify.routes.root
            : '/';

        const response = await fetch(
          shopifyRoot + 'cart/add.js',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify({
              items: [
                {
                  id: variant.id,
                  quantity: 1
                }
              ]
            })
          }
        );

        let responseData = null;

        try {
          responseData = await response.json();
        } catch (parseError) {
          responseData = null;
        }

        if (!response.ok) {
          const errorMessage =
            responseData &&
            (responseData.description || responseData.message)
              ? responseData.description || responseData.message
              : 'The item could not be added to your cart.';

          throw new Error(errorMessage);
        }

        requestSucceeded = true;

        this.addButton.textContent = 'Added';
        this.status.textContent = `${this.activeProduct.title} was added to your cart.`;

        document.dispatchEvent(
          new CustomEvent('ee-test:cart-added', {
            detail: responseData
          })
        );

        this.successTimer = window.setTimeout(() => {
          this.successTimer = null;

          if (
            this.isOpen &&
            this.activeVariant &&
            this.activeVariant.available
          ) {
            this.addButton.disabled = false;
            this.addButton.textContent = 'Add to cart';
          }
        }, 1800);
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Something went wrong. Please try again.';

        this.status.textContent = message;
        this.addButton.textContent = 'Add to cart';
      } finally {
        this.isSubmitting = false;

        if (
          !requestSucceeded &&
          this.activeVariant &&
          this.activeVariant.available
        ) {
          this.addButton.disabled = false;
        }
      }
    }

    trapFocus(event) {
      if (!this.dialog) {
        return;
      }

      const focusableElements = Array.from(
        this.dialog.querySelectorAll(
          [
            'button:not([disabled])',
            'select:not([disabled])',
            'a[href]',
            'input:not([disabled])',
            '[tabindex]:not([tabindex="-1"])'
          ].join(',')
        )
      ).filter((element) => {
        return (
          !element.hasAttribute('hidden') &&
          element.getClientRects().length > 0
        );
      });

      if (focusableElements.length === 0) {
        event.preventDefault();
        this.dialog.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    lockBody() {
      this.previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    unlockBody() {
      document.body.style.overflow =
        this.previousBodyOverflow || '';

      this.previousBodyOverflow = '';
    }
  }

  customElements.define(ELEMENT_NAME, EETestProductGrid);
})();

(() => {
  const GLOBAL_NAME = '__giftGuideGrid';
  const GRID_SELECTOR = '[data-gift-guide-grid]';
  const instances = new WeakMap();

  class GiftGuideGrid {
    constructor(root) {
      this.root = root;
      this.modal = root.querySelector('[data-gift-guide-modal]');

      if (!this.modal) return;

      this.dialog = this.modal.querySelector('[data-modal-dialog]');
      this.loading = this.modal.querySelector('[data-modal-loading]');
      this.error = this.modal.querySelector('[data-modal-error]');
      this.content = this.modal.querySelector('[data-modal-content]');
      this.image = this.modal.querySelector('[data-modal-image]');
      this.title = this.modal.querySelector('[data-modal-title]');
      this.price = this.modal.querySelector('[data-modal-price]');
      this.description = this.modal.querySelector('[data-modal-description]');
      this.optionsContainer = this.modal.querySelector('[data-modal-options]');
      this.status = this.modal.querySelector('[data-modal-status]');
      this.addButton = this.modal.querySelector('[data-modal-add]');
      this.addButtonLabel = this.modal.querySelector('[data-modal-add-label]');
      this.closeButton = this.modal.querySelector('.gift-guide-modal__close');

      this.defaultAddLabel =
        this.addButtonLabel?.textContent.trim() || 'ADD TO CART';

      this.product = null;
      this.selectedVariant = null;
      this.selectedOptions = [];
      this.activeTrigger = null;
      this.abortController = null;
      this.closeTimer = null;

      this.handleRootClick = this.handleRootClick.bind(this);
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleAddToCart = this.handleAddToCart.bind(this);

      this.root.addEventListener('click', this.handleRootClick);
      this.addButton?.addEventListener('click', this.handleAddToCart);
    }

    handleRootClick(event) {
      const hotspot = event.target.closest('.gift-guide-grid__hotspot');

      if (hotspot && this.root.contains(hotspot)) {
        const productHandle = hotspot.dataset.productHandle;

        if (productHandle) {
          this.open(productHandle, hotspot);
        }

        return;
      }

      const closeControl = event.target.closest('[data-modal-close]');

      if (closeControl && this.modal.contains(closeControl)) {
        this.close();
      }
    }

    async open(productHandle, trigger) {
      this.abortRequest();
      window.clearTimeout(this.closeTimer);

      this.activeTrigger = trigger;
      this.reset();

      this.modal.hidden = false;
      this.modal.setAttribute('aria-hidden', 'false');
      this.dialog.setAttribute('aria-busy', 'true');

      document.body.classList.add('gift-guide-modal-open');
      document.addEventListener('keydown', this.handleKeydown);

      requestAnimationFrame(() => {
        this.modal.classList.add('is-open');
        this.closeButton?.focus();
      });

      this.abortController = new AbortController();

      try {
        const rootPath = window.Shopify?.routes?.root || '/';
        const url = `${rootPath}products/${encodeURIComponent(productHandle)}.js`;

        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: this.abortController.signal
        });

        if (!response.ok) {
          throw new Error(`Product request failed: ${response.status}`);
        }

        const product = await response.json();

        this.product = product;
        this.renderProduct(product);
      } catch (error) {
        if (error.name === 'AbortError') return;

        console.error('Gift Guide product error:', error);
        this.showError();
      } finally {
        this.dialog.setAttribute('aria-busy', 'false');
      }
    }

    close() {
      this.abortRequest();

      this.modal.classList.remove('is-open');
      this.modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('gift-guide-modal-open');
      document.removeEventListener('keydown', this.handleKeydown);

      this.closeTimer = window.setTimeout(() => {
        if (!this.modal.classList.contains('is-open')) {
          this.modal.hidden = true;
        }
      }, 200);

      this.activeTrigger?.focus();
      this.activeTrigger = null;
    }

    abortRequest() {
      if (!this.abortController) return;

      this.abortController.abort();
      this.abortController = null;
    }

    reset() {
      this.product = null;
      this.selectedVariant = null;
      this.selectedOptions = [];

      this.loading.hidden = false;
      this.error.hidden = true;
      this.content.hidden = true;

      this.image.removeAttribute('src');
      this.image.alt = '';
      this.title.textContent = '';
      this.price.textContent = '';
      this.description.innerHTML = '';
      this.optionsContainer.innerHTML = '';
      this.status.textContent = '';

      this.addButton.disabled = true;
      this.addButton.removeAttribute('data-variant-id');
      this.addButtonLabel.textContent = this.defaultAddLabel;
    }

    showError() {
      this.loading.hidden = true;
      this.content.hidden = true;
      this.error.hidden = false;
    }

    renderProduct(product) {
      const productImage = product.featured_image || product.images?.[0] || '';

      this.image.src = this.normalizeImageUrl(productImage);
      this.image.alt = product.title || '';
      this.title.textContent = product.title || '';
      this.price.textContent = this.formatMoney(product.price);
      this.description.innerHTML = product.description || '';

      this.selectedOptions = new Array(product.options?.length || 0).fill(null);

      this.renderOptions(product);
      this.updateSelectedVariant();

      this.loading.hidden = true;
      this.error.hidden = true;
      this.content.hidden = false;
    }

    renderOptions(product) {
      const productOptions = product.options || [];
      const firstAvailableVariant =
        product.variants.find((variant) => variant.available) ||
        product.variants[0];

      productOptions.forEach((option, optionIndex) => {
        const optionName =
          typeof option === 'string'
            ? option
            : option.name || `Option ${optionIndex + 1}`;

        const values = [
          ...new Set(
            product.variants
              .map((variant) => variant.options[optionIndex])
              .filter(Boolean)
          )
        ];

        const normalizedName = optionName.trim().toLowerCase();
        const isDefaultTitle =
          normalizedName === 'title' &&
          values.length === 1 &&
          values[0] === 'Default Title';

        if (isDefaultTitle) {
          this.selectedOptions[optionIndex] = values[0];
          return;
        }

        const group = document.createElement('div');
        group.className = 'gift-guide-modal__option-group';

        const label = document.createElement('p');
        label.className = 'gift-guide-modal__option-label';
        label.textContent = optionName;
        group.appendChild(label);

        const isColorOption =
          normalizedName.includes('color') ||
          normalizedName.includes('colour');

        if (isColorOption) {
          this.renderColorOption({
            group,
            values,
            optionIndex,
            firstAvailableVariant
          });
        } else {
          this.renderSelectOption({
            group,
            values,
            optionIndex,
            optionName
          });
        }

        this.optionsContainer.appendChild(group);
      });
    }

    renderColorOption({
      group,
      values,
      optionIndex,
      firstAvailableVariant
    }) {
      const initialValue =
        firstAvailableVariant?.options?.[optionIndex] || values[0] || null;

      this.selectedOptions[optionIndex] = initialValue;

      const list = document.createElement('div');
      list.className = 'gift-guide-modal__color-list';

      values.forEach((value) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gift-guide-modal__color-option';
        button.dataset.optionValue = value;
        button.setAttribute(
          'aria-pressed',
          value === initialValue ? 'true' : 'false'
        );

        if (value === initialValue) {
          button.classList.add('is-selected');
        }

        const swatch = document.createElement('span');
        swatch.className = 'gift-guide-modal__color-swatch';
        swatch.setAttribute('aria-hidden', 'true');
        swatch.style.background = this.getSwatchColor(value);

        const text = document.createElement('span');
        text.className = 'gift-guide-modal__color-name';
        text.textContent = value;

        button.appendChild(swatch);
        button.appendChild(text);

        button.addEventListener('click', () => {
          this.selectedOptions[optionIndex] = value;

          list
            .querySelectorAll('.gift-guide-modal__color-option')
            .forEach((colorButton) => {
              const selected = colorButton.dataset.optionValue === value;

              colorButton.classList.toggle('is-selected', selected);
              colorButton.setAttribute(
                'aria-pressed',
                selected ? 'true' : 'false'
              );
            });

          this.updateSelectedVariant();
        });

        list.appendChild(button);
      });

      group.appendChild(list);
    }

    renderSelectOption({ group, values, optionIndex, optionName }) {
      const select = document.createElement('select');
      select.className = 'gift-guide-modal__select';
      select.setAttribute('aria-label', optionName);

      if (values.length > 1) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = `Choose your ${optionName}`;
        placeholder.disabled = true;
        placeholder.selected = true;
        select.appendChild(placeholder);
      }

      values.forEach((value) => {
        const optionElement = document.createElement('option');
        optionElement.value = value;
        optionElement.textContent = value;
        select.appendChild(optionElement);
      });

      if (values.length === 1) {
        select.value = values[0];
        this.selectedOptions[optionIndex] = values[0];
      }

      select.addEventListener('change', () => {
        this.selectedOptions[optionIndex] = select.value || null;
        this.updateSelectedVariant();
      });

      group.appendChild(select);
    }

    updateSelectedVariant() {
      if (!this.product) return;

      const allSelected =
        this.selectedOptions.length === 0 ||
        this.selectedOptions.every(Boolean);

      if (!allSelected) {
        this.selectedVariant = null;
        this.disableAddButton(
          this.defaultAddLabel,
          'Please choose all options.'
        );
        return;
      }

      const variant = this.product.variants.find((productVariant) =>
        productVariant.options.every(
          (value, index) => value === this.selectedOptions[index]
        )
      );

      this.selectedVariant = variant || null;

      if (!variant) {
        this.disableAddButton(
          'UNAVAILABLE',
          'This combination is unavailable.'
        );
        return;
      }

      this.price.textContent = this.formatMoney(variant.price);

      const variantImage =
        variant.featured_image?.src || variant.featured_image;

      if (variantImage) {
        this.image.src = this.normalizeImageUrl(variantImage);
      }

      if (!variant.available) {
        this.disableAddButton(
          'SOLD OUT',
          'The selected variant is sold out.'
        );
        return;
      }

      this.addButton.disabled = false;
      this.addButton.dataset.variantId = String(variant.id);
      this.addButtonLabel.textContent = this.defaultAddLabel;
      this.status.textContent = '';
    }

    disableAddButton(label, status) {
      this.addButton.disabled = true;
      this.addButton.removeAttribute('data-variant-id');
      this.addButtonLabel.textContent = label;
      this.status.textContent = status;
    }

    async handleAddToCart() {
      const variantId = Number(this.addButton.dataset.variantId);

      if (!variantId || !this.selectedVariant) return;

      this.addButton.disabled = true;
      this.addButtonLabel.textContent = 'ADDING...';
      this.status.textContent = '';

      try {
        const rootPath = window.Shopify?.routes?.root || '/';
        const response = await fetch(`${rootPath}cart/add.js`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({
            items: [{ id: variantId, quantity: 1 }]
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.description ||
              result.message ||
              'The product could not be added.'
          );
        }

        this.addButtonLabel.textContent = 'ADDED TO CART';
        this.status.textContent = 'The product was added to your cart.';

        await this.updateCartCount();

        document.dispatchEvent(
          new CustomEvent('gift-guide:cart-added', {
            detail: {
              product: this.product,
              variant: this.selectedVariant,
              response: result
            }
          })
        );

        window.setTimeout(() => this.close(), 900);
      } catch (error) {
        console.error('Gift Guide cart error:', error);
        this.status.textContent =
          error.message || 'The product could not be added.';
        this.addButton.disabled = false;
        this.addButtonLabel.textContent = this.defaultAddLabel;
      }
    }

    async updateCartCount() {
      try {
        const rootPath = window.Shopify?.routes?.root || '/';
        const response = await fetch(`${rootPath}cart.js`, {
          headers: { Accept: 'application/json' }
        });

        if (!response.ok) return;

        const cart = await response.json();
        const count = Number(cart.item_count || 0);
        const bubbles = document.querySelectorAll('.cart-count-bubble');

        bubbles.forEach((bubble) => {
          const visibleCount = bubble.querySelector('span[aria-hidden="true"]');
          const accessibleCount = bubble.querySelector('.visually-hidden');

          if (visibleCount) visibleCount.textContent = String(count);
          if (accessibleCount) {
            accessibleCount.textContent = `${count} items`;
          }
        });
      } catch (error) {
        console.warn('Cart count could not be updated:', error);
      }
    }

    handleKeydown(event) {
      if (event.key === 'Escape') {
        this.close();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = [
        ...this.dialog.querySelectorAll(
          'button:not([disabled]), select:not([disabled]), a[href], ' +
            'input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ].filter(
        (element) => !element.hidden && element.offsetParent !== null
      );

      if (!focusable.length) {
        event.preventDefault();
        this.dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    getSwatchColor(value) {
      const normalized = String(value || '').trim().toLowerCase();
      const map = {
        'navy blue': '#000080',
        navy: '#000080',
        'light blue': '#add8e6',
        'dark blue': '#00008b',
        'light grey': '#d3d3d3',
        'light gray': '#d3d3d3',
        'dark grey': '#555555',
        'dark gray': '#555555',
        multicolor: 'linear-gradient(135deg, #ff4d4d, #ffd84d, #4ddf7c, #4da6ff)'
      };

      return map[normalized] || value;
    }

    normalizeImageUrl(url) {
      if (!url) return '';
      return url.startsWith('//') ? `https:${url}` : url;
    }

    formatMoney(cents) {
      const currency =
        window.Shopify?.currency?.active ||
        this.root.dataset.currency ||
        'USD';
      const locale = document.documentElement.lang || 'en';

      try {
        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency
        }).format(Number(cents || 0) / 100);
      } catch (error) {
        return `${(Number(cents || 0) / 100).toFixed(2)} ${currency}`;
      }
    }

    destroy() {
      this.abortRequest();
      window.clearTimeout(this.closeTimer);
      this.root.removeEventListener('click', this.handleRootClick);
      this.addButton?.removeEventListener('click', this.handleAddToCart);
      document.removeEventListener('keydown', this.handleKeydown);
    }
  }

  function findRoots(scope) {
    if (scope.matches?.(GRID_SELECTOR)) return [scope];
    return [...scope.querySelectorAll(GRID_SELECTOR)];
  }

  function initialize(scope = document) {
    findRoots(scope).forEach((root) => {
      if (instances.has(root)) return;
      instances.set(root, new GiftGuideGrid(root));
    });
  }

  function destroy(scope) {
    findRoots(scope).forEach((root) => {
      const instance = instances.get(root);
      instance?.destroy();
      instances.delete(root);
    });
  }

  if (window[GLOBAL_NAME]) {
    window[GLOBAL_NAME].initialize(document);
    return;
  }

  window[GLOBAL_NAME] = { initialize, destroy };

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => initialize(document),
      { once: true }
    );
  } else {
    initialize(document);
  }

  document.addEventListener('shopify:section:load', (event) => {
    initialize(event.target);
  });

  document.addEventListener('shopify:section:unload', (event) => {
    destroy(event.target);
  });
})();
