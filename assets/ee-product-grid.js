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
  const COMPONENT_NAME = 'ee-test-product-grid';

  if (customElements.get(COMPONENT_NAME)) {
    return;
  }

  class EETestProductGrid extends HTMLElement {
    connectedCallback() {
      this.destroyListeners();

      this.abortController = new AbortController();
      this.signal = this.abortController.signal;

      this.productData = new Map();
      this.bonusProduct = null;

      this.popup = this.querySelector('[data-ee-test-popup]');
      this.dialog = this.querySelector('[data-ee-test-popup-dialog]');
      this.overlay = this.querySelector('[data-ee-test-popup-overlay]');
      this.closeButton = this.querySelector('[data-ee-test-popup-close]');

      this.popupImage = this.querySelector(
        '[data-ee-test-popup-image]'
      );

      this.popupTitle = this.querySelector(
        '[data-ee-test-popup-title]'
      );

      this.popupPrice = this.querySelector(
        '[data-ee-test-popup-price]'
      );

      this.popupCompare = this.querySelector(
        '[data-ee-test-popup-compare]'
      );

      this.popupDescription = this.querySelector(
        '[data-ee-test-popup-description]'
      );

      this.optionsContainer = this.querySelector(
        '[data-ee-test-popup-options]'
      );

      this.availabilityElement = this.querySelector(
        '[data-ee-test-popup-availability]'
      );

      this.addButton = this.querySelector(
        '[data-ee-test-popup-add]'
      );

      this.addLabel = this.querySelector(
        '[data-ee-test-add-label]'
      );

      this.statusElement = this.querySelector(
        '[data-ee-test-popup-status]'
      );

      this.currentProduct = null;
      this.currentVariant = null;
      this.currentTrigger = null;

      this.selectedOptions = [];

      this.isOpen = false;
      this.isSubmitting = false;

      this.previousBodyOverflow = '';
      this.resetButtonTimer = null;

      this.readProducts();
      this.bindEvents();
    }

    disconnectedCallback() {
      if (this.isOpen) {
        this.closePopup(false);
      }

      this.destroyListeners();

      if (this.resetButtonTimer) {
        window.clearTimeout(this.resetButtonTimer);
        this.resetButtonTimer = null;
      }
    }

    destroyListeners() {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
    }

    readProducts() {
      const jsonElement = this.querySelector(
        '[data-ee-test-product-data]'
      );

      if (!jsonElement) {
        return;
      }

      try {
        const data = JSON.parse(jsonElement.textContent);

        if (!data) {
          return;
        }

        if (data.bonusProduct) {
          this.bonusProduct = data.bonusProduct;
        }

        if (!Array.isArray(data.products)) {
          return;
        }

        data.products.forEach((product) => {
          if (product && product.key) {
            this.productData.set(
              String(product.key),
              product
            );
          }
        });
      } catch (error) {
        console.error(
          'EE product popup: product data could not be parsed.',
          error
        );
      }
    }

    bindEvents() {
      this.addEventListener(
        'click',
        (event) => this.handleClick(event),
        {
          signal: this.signal
        }
      );

      this.addEventListener(
        'change',
        (event) => this.handleChange(event),
        {
          signal: this.signal
        }
      );

      document.addEventListener(
        'keydown',
        (event) => this.handleKeydown(event),
        {
          signal: this.signal
        }
      );
    }

    handleClick(event) {
      const hotspot = event.target.closest(
        '[data-ee-test-hotspot]'
      );

      if (hotspot && this.contains(hotspot)) {
        const key = hotspot.dataset.productKey;

        const product = this.productData.get(
          String(key)
        );

        if (product) {
          this.openPopup(product, hotspot);
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
        const optionIndex = Number(
          optionButton.dataset.optionIndex
        );

        const optionValue =
          optionButton.dataset.optionValue;

        if (
          Number.isInteger(optionIndex) &&
          typeof optionValue === 'string'
        ) {
          this.selectedOptions[optionIndex] =
            optionValue;

          this.updateFirstOptionButtons(
            optionIndex
          );

          this.updateVariant();
        }

        return;
      }

      if (
        event.target.closest(
          '[data-ee-test-popup-close]'
        )
      ) {
        this.closePopup(true);
        return;
      }

      if (event.target === this.overlay) {
        this.closePopup(true);
        return;
      }

      if (
        event.target.closest(
          '[data-ee-test-popup-add]'
        )
      ) {
        this.addToCart();
      }
    }

    handleChange(event) {
      const select = event.target.closest(
        '[data-ee-test-option-select]'
      );

      if (
        !select ||
        !this.optionsContainer ||
        !this.optionsContainer.contains(select)
      ) {
        return;
      }

      const optionIndex = Number(
        select.dataset.optionIndex
      );

      if (!Number.isInteger(optionIndex)) {
        return;
      }

      this.selectedOptions[optionIndex] =
        select.value;

      this.updateVariant();
    }

    handleKeydown(event) {
      if (!this.isOpen) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        this.closePopup(true);
        return;
      }

      if (event.key === 'Tab') {
        this.trapFocus(event);
      }
    }

    openPopup(product, trigger) {
      if (!this.popup || !this.dialog) {
        return;
      }

      if (this.resetButtonTimer) {
        window.clearTimeout(
          this.resetButtonTimer
        );

        this.resetButtonTimer = null;
      }

      this.currentProduct = product;
      this.currentTrigger = trigger;
      this.isSubmitting = false;

      const startingVariant =
        product.variants.find(
          (variant) =>
            variant.id ===
            product.selectedVariantId
        ) ||
        product.variants.find(
          (variant) => variant.available
        ) ||
        product.variants[0] ||
        null;

      if (startingVariant) {
        this.selectedOptions = [
          ...startingVariant.options
        ];
      } else {
        this.selectedOptions =
          product.options.map((option) => {
            return option.values[0] || '';
          });
      }

      this.popupTitle.textContent =
        product.title || '';

      this.popupDescription.textContent =
        product.description || '';

      this.statusElement.textContent = '';

      this.updateImage(
        product.featuredImage
      );

      this.renderOptions();
      this.updateVariant();

      this.popup.hidden = false;
      this.isOpen = true;

      this.lockBody();

      window.requestAnimationFrame(() => {
        if (this.closeButton) {
          this.closeButton.focus();
        }
      });
    }

    closePopup(restoreFocus = true) {
      if (!this.popup || !this.isOpen) {
        return;
      }

      this.popup.hidden = true;

      this.isOpen = false;
      this.isSubmitting = false;

      this.unlockBody();

      const trigger = this.currentTrigger;

      this.currentProduct = null;
      this.currentVariant = null;
      this.currentTrigger = null;

      this.selectedOptions = [];

      if (
        restoreFocus &&
        trigger &&
        trigger.isConnected
      ) {
        trigger.focus();
      }
    }

    renderOptions() {
      if (
        !this.currentProduct ||
        !this.optionsContainer
      ) {
        return;
      }

      this.optionsContainer.replaceChildren();

      this.currentProduct.options.forEach(
        (option, index) => {
          if (index === 0) {
            this.renderButtonOption(
              option,
              index
            );
          } else {
            this.renderSelectOption(
              option,
              index
            );
          }
        }
      );
    }

    renderButtonOption(
      option,
      optionIndex
    ) {
      const fieldset =
        document.createElement('fieldset');

      fieldset.className =
        'ee-test-product-popup__option-group';

      const legend =
        document.createElement('legend');

      legend.className =
        'ee-test-product-popup__option-title';

      legend.textContent = option.name;

      const buttons =
        document.createElement('div');

      buttons.className =
        'ee-test-product-popup__option-buttons';

      option.values.forEach((value) => {
        const button =
          document.createElement('button');

        button.type = 'button';

        button.className =
          'ee-test-product-popup__option-button';

        button.dataset.eeTestOptionButton = '';
        button.dataset.optionIndex =
          String(optionIndex);

        button.dataset.optionValue =
          String(value);

        button.textContent =
          String(value);

        const isSelected =
          String(
            this.selectedOptions[
              optionIndex
            ]
          ) === String(value);

        button.setAttribute(
          'aria-pressed',
          isSelected ? 'true' : 'false'
        );

        buttons.appendChild(button);
      });

      fieldset.appendChild(legend);
      fieldset.appendChild(buttons);

      this.optionsContainer.appendChild(
        fieldset
      );
    }

    renderSelectOption(
      option,
      optionIndex
    ) {
      const group =
        document.createElement('div');

      group.className =
        'ee-test-product-popup__option-group';

      const label =
        document.createElement('label');

      label.className =
        'ee-test-product-popup__option-title';

      const selectWrapper =
        document.createElement('div');

      selectWrapper.className =
        'ee-test-product-popup__select-wrapper';

      const select =
        document.createElement('select');

      const id = [
        'ee-test-product-option',
        this.dataset.sectionId ||
          'section',
        optionIndex
      ].join('-');

      label.htmlFor = id;
      label.textContent = option.name;

      select.id = id;

      select.className =
        'ee-test-product-popup__select';

      select.dataset.eeTestOptionSelect = '';

      select.dataset.optionIndex =
        String(optionIndex);

      option.values.forEach((value) => {
        const optionElement =
          document.createElement('option');

        optionElement.value =
          String(value);

        optionElement.textContent =
          String(value);

        if (
          String(
            this.selectedOptions[
              optionIndex
            ]
          ) === String(value)
        ) {
          optionElement.selected = true;
        }

        select.appendChild(
          optionElement
        );
      });

      selectWrapper.appendChild(select);

      group.appendChild(label);
      group.appendChild(selectWrapper);

      this.optionsContainer.appendChild(
        group
      );
    }

    updateFirstOptionButtons(
      optionIndex
    ) {
      if (!this.optionsContainer) {
        return;
      }

      const buttons =
        this.optionsContainer.querySelectorAll(
          `[data-ee-test-option-button][data-option-index="${optionIndex}"]`
        );

      buttons.forEach((button) => {
        const selected =
          String(
            button.dataset.optionValue
          ) ===
          String(
            this.selectedOptions[
              optionIndex
            ]
          );

        button.setAttribute(
          'aria-pressed',
          selected ? 'true' : 'false'
        );
      });
    }

    findVariant() {
      if (!this.currentProduct) {
        return null;
      }

      return (
        this.currentProduct.variants.find(
          (variant) => {
            if (
              !Array.isArray(
                variant.options
              )
            ) {
              return false;
            }

            if (
              variant.options.length !==
              this.selectedOptions.length
            ) {
              return false;
            }

            return variant.options.every(
              (value, index) => {
                return (
                  String(value) ===
                  String(
                    this.selectedOptions[
                      index
                    ]
                  )
                );
              }
            );
          }
        ) || null
      );
    }

    updateVariant() {
      if (!this.currentProduct) {
        return;
      }

      const variant =
        this.findVariant();

      this.currentVariant = variant;

      if (!variant) {
        this.popupPrice.textContent =
          'Unavailable';

        this.popupCompare.textContent =
          '';

        this.popupCompare.hidden = true;

        this.availabilityElement.textContent =
          'This combination is unavailable.';

        this.addButton.disabled = true;

        this.addLabel.textContent =
          'UNAVAILABLE';

        this.updateImage(
          this.currentProduct
            .featuredImage
        );

        return;
      }

      this.popupPrice.textContent =
        variant.priceFormatted || '';

      if (
        variant.compareAtPrice &&
        variant.compareAtPrice >
          variant.price &&
        variant.compareAtPriceFormatted
      ) {
        this.popupCompare.textContent =
          variant.compareAtPriceFormatted;

        this.popupCompare.hidden = false;
      } else {
        this.popupCompare.textContent =
          '';

        this.popupCompare.hidden = true;
      }

      if (variant.image) {
        this.updateImage(
          variant.image
        );
      } else {
        this.updateImage(
          this.currentProduct
            .featuredImage
        );
      }

      if (variant.available) {
        this.availabilityElement.textContent =
          'In stock';

        this.addButton.disabled =
          this.isSubmitting;

        if (!this.isSubmitting) {
          this.addLabel.textContent =
            'ADD TO CART';
        }
      } else {
        this.availabilityElement.textContent =
          'Sold out';

        this.addButton.disabled = true;

        this.addLabel.textContent =
          'SOLD OUT';
      }
    }

    updateImage(image) {
      if (!this.popupImage) {
        return;
      }

      if (!image || !image.src) {
        this.popupImage.removeAttribute(
          'src'
        );

        this.popupImage.alt = '';

        return;
      }

      this.popupImage.src = image.src;

      this.popupImage.alt =
        image.alt ||
        this.currentProduct?.title ||
        '';

      if (image.width) {
        this.popupImage.width =
          Number(image.width);
      }

      if (image.height) {
        this.popupImage.height =
          Number(image.height);
      }
    }

    variantQualifiesForBonus(
      variant
    ) {
      if (
        !variant ||
        !Array.isArray(
          variant.options
        )
      ) {
        return false;
      }

      const normalizedOptions =
        variant.options.map((value) => {
          return String(value)
            .trim()
            .toLowerCase();
        });

      return (
        normalizedOptions.includes(
          'black'
        ) &&
        normalizedOptions.includes(
          'medium'
        )
      );
    }

    shouldAddBonusProduct() {
      if (
        !this.currentProduct ||
        !this.currentVariant ||
        !this.bonusProduct
      ) {
        return false;
      }

      if (
        !this.bonusProduct.variantId ||
        !this.bonusProduct.available
      ) {
        return false;
      }

      if (
        !this.variantQualifiesForBonus(
          this.currentVariant
        )
      ) {
        return false;
      }

      /*
       * Do not automatically add the
       * bonus product to itself.
       */
      if (
        Number(
          this.currentProduct.id
        ) ===
        Number(
          this.bonusProduct.id
        )
      ) {
        return false;
      }

      return true;
    }

    buildCartItems() {
      const items = [
        {
          id: this.currentVariant.id,
          quantity: 1
        }
      ];

      if (
        this.shouldAddBonusProduct()
      ) {
        items.push({
          id: this.bonusProduct.variantId,
          quantity: 1
        });
      }

      return items;
    }

    async addToCart() {
      if (
        !this.currentProduct ||
        !this.currentVariant ||
        !this.currentVariant.available ||
        this.isSubmitting
      ) {
        return;
      }

      this.isSubmitting = true;

      this.addButton.disabled = true;
      this.addLabel.textContent =
        'ADDING...';

      const includesBonus =
        this.shouldAddBonusProduct();

      this.statusElement.textContent =
        includesBonus
          ? `Adding ${this.currentProduct.title} and ${this.bonusProduct.title} to cart.`
          : `Adding ${this.currentProduct.title} to cart.`;

      try {
        const root =
          window.Shopify?.routes?.root ||
          '/';

        const cartItems =
          this.buildCartItems();

        const response = await fetch(
          root + 'cart/add.js',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json'
            },

            body: JSON.stringify({
              items: cartItems
            })
          }
        );

        let responseData = null;

        try {
          responseData =
            await response.json();
        } catch (parseError) {
          responseData = null;
        }

        if (!response.ok) {
          const message =
            responseData?.description ||
            responseData?.message ||
            'Unable to add this product to the cart.';

          throw new Error(message);
        }

        this.addLabel.textContent =
          'ADDED';

        if (includesBonus) {
          this.statusElement.textContent =
            `${this.currentProduct.title} and ${this.bonusProduct.title} were added to your cart.`;
        } else {
          this.statusElement.textContent =
            `${this.currentProduct.title} was added to your cart.`;
        }

        document.dispatchEvent(
          new CustomEvent(
            'ee-test:cart-added',
            {
              detail: responseData
            }
          )
        );

        this.resetButtonTimer =
          window.setTimeout(() => {
            this.resetButtonTimer =
              null;

            if (
              this.isOpen &&
              this.currentVariant &&
              this.currentVariant
                .available
            ) {
              this.addButton.disabled =
                false;

              this.addLabel.textContent =
                'ADD TO CART';
            }
          }, 1800);
      } catch (error) {
        this.statusElement.textContent =
          error instanceof Error &&
          error.message
            ? error.message
            : 'Something went wrong. Please try again.';

        this.addLabel.textContent =
          'ADD TO CART';

        if (
          this.currentVariant &&
          this.currentVariant.available
        ) {
          this.addButton.disabled =
            false;
        }
      } finally {
        this.isSubmitting = false;
      }
    }

    trapFocus(event) {
      if (!this.dialog) {
        return;
      }

      const selector = [
        'button:not([disabled])',
        'select:not([disabled])',
        'a[href]',
        'input:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
      ].join(',');

      const focusable = Array.from(
        this.dialog.querySelectorAll(
          selector
        )
      ).filter((element) => {
        return (
          element.getClientRects()
            .length > 0
        );
      });

      if (!focusable.length) {
        event.preventDefault();

        this.dialog.focus();

        return;
      }

      const first = focusable[0];

      const last =
        focusable[
          focusable.length - 1
        ];

      if (
        event.shiftKey &&
        document.activeElement ===
          first
      ) {
        event.preventDefault();

        last.focus();

        return;
      }

      if (
        !event.shiftKey &&
        document.activeElement ===
          last
      ) {
        event.preventDefault();

        first.focus();
      }
    }

    lockBody() {
      this.previousBodyOverflow =
        document.body.style.overflow;

      document.body.style.overflow =
        'hidden';
    }

    unlockBody() {
      document.body.style.overflow =
        this.previousBodyOverflow ||
        '';

      this.previousBodyOverflow =
        '';
    }
  }

  customElements.define(
    COMPONENT_NAME,
    EETestProductGrid
  );
})();