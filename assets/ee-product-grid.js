(() => {
  'use strict';

  const SELECTORS = {
    grid: '[data-gift-guide-grid]',
    hotspot: '.gift-guide-grid__hotspot',

    modal: '[data-gift-guide-modal]',
    dialog: '[data-modal-dialog]',
    close: '[data-modal-close]',

    loading: '[data-modal-loading]',
    error: '[data-modal-error]',
    content: '[data-modal-content]',

    image: '[data-modal-image]',
    title: '[data-modal-title]',
    price: '[data-modal-price]',
    description: '[data-modal-description]',

    options: '[data-modal-options]',
    status: '[data-modal-status]',

    addButton: '[data-modal-add]',
    addLabel: '[data-modal-add-label]'
  };

  const instances = new WeakMap();

  class GiftGuideGrid {
    constructor(root) {
      this.root = root;

      this.abortController = new AbortController();
      this.signal = this.abortController.signal;

      this.modal = root.querySelector(SELECTORS.modal);
      this.dialog = root.querySelector(SELECTORS.dialog);

      this.loadingElement = root.querySelector(SELECTORS.loading);
      this.errorElement = root.querySelector(SELECTORS.error);
      this.contentElement = root.querySelector(SELECTORS.content);

      this.imageElement = root.querySelector(SELECTORS.image);
      this.titleElement = root.querySelector(SELECTORS.title);
      this.priceElement = root.querySelector(SELECTORS.price);
      this.descriptionElement = root.querySelector(
        SELECTORS.description
      );

      this.optionsElement = root.querySelector(SELECTORS.options);
      this.statusElement = root.querySelector(SELECTORS.status);

      this.addButton = root.querySelector(SELECTORS.addButton);
      this.addLabel = root.querySelector(SELECTORS.addLabel);

      this.currency =
        root.dataset.currency || 'USD';

      this.routesRoot =
        window.Shopify &&
        window.Shopify.routes &&
        window.Shopify.routes.root
          ? window.Shopify.routes.root
          : '/';

      this.defaultAddLabel =
        this.addLabel?.textContent.trim() ||
        'ADD TO CART';

      this.currentProduct = null;
      this.currentVariant = null;
      this.currentTrigger = null;

      this.selectedOptions = [];

      this.isOpen = false;
      this.isSubmitting = false;

      this.bodyOverflowBeforeOpen = '';

      this.init();
    }

    init() {
      this.root.addEventListener(
        'click',
        this.handleRootClick.bind(this),
        {
          signal: this.signal
        }
      );

      this.root.addEventListener(
        'change',
        this.handleRootChange.bind(this),
        {
          signal: this.signal
        }
      );

      document.addEventListener(
        'keydown',
        this.handleDocumentKeydown.bind(this),
        {
          signal: this.signal
        }
      );
    }

    destroy() {
      if (this.isOpen) {
        this.closeModal(false);
      }

      this.abortController.abort();
    }

    handleRootClick(event) {
      const hotspot = event.target.closest(
        SELECTORS.hotspot
      );

      if (
        hotspot &&
        this.root.contains(hotspot)
      ) {
        event.preventDefault();

        const handle =
          hotspot.dataset.productHandle;

        if (handle) {
          this.openProduct(
            handle,
            hotspot
          );
        }

        return;
      }

      const closeButton =
        event.target.closest(
          SELECTORS.close
        );

      if (
        closeButton &&
        this.modal &&
        this.modal.contains(closeButton)
      ) {
        event.preventDefault();

        this.closeModal(true);

        return;
      }

      const optionButton =
        event.target.closest(
          '[data-gift-option-button]'
        );

      if (
        optionButton &&
        this.optionsElement &&
        this.optionsElement.contains(
          optionButton
        )
      ) {
        event.preventDefault();

        const index = Number(
          optionButton.dataset.optionIndex
        );

        const value =
          optionButton.dataset.optionValue;

        if (
          Number.isInteger(index) &&
          typeof value === 'string'
        ) {
          this.selectedOptions[index] =
            value;

          this.updateButtonStates(index);

          this.updateSelectedVariant();
        }

        return;
      }

      const addButton =
        event.target.closest(
          SELECTORS.addButton
        );

      if (
        addButton &&
        this.modal &&
        this.modal.contains(addButton)
      ) {
        event.preventDefault();

        this.addToCart();
      }
    }

    handleRootChange(event) {
      const select =
        event.target.closest(
          '[data-gift-option-select]'
        );

      if (
        !select ||
        !this.optionsElement ||
        !this.optionsElement.contains(
          select
        )
      ) {
        return;
      }

      const index = Number(
        select.dataset.optionIndex
      );

      if (!Number.isInteger(index)) {
        return;
      }

      this.selectedOptions[index] =
        select.value;

      this.updateSelectedVariant();
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

    async openProduct(handle, trigger) {
      if (!this.modal) {
        return;
      }

      this.currentTrigger = trigger;

      this.showModal();
      this.showLoading();

      try {
        const product =
          await this.fetchProduct(handle);

        this.currentProduct = product;

        this.prepareProduct(product);

        this.showContent();
      } catch (error) {
        console.error(
          'Gift guide product error:',
          error
        );

        this.showError();
      }
    }

    async fetchProduct(handle) {
      const encodedHandle =
        encodeURIComponent(handle);

      const url =
        `${this.routesRoot}products/${encodedHandle}.js`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(
          `Product request failed with status ${response.status}`
        );
      }

      const product =
        await response.json();

      if (
        !product ||
        !Array.isArray(product.variants)
      ) {
        throw new Error(
          'Invalid product data returned by Shopify.'
        );
      }

      return product;
    }

    prepareProduct(product) {
      const startingVariant =
        product.variants.find(
          (variant) => variant.available
        ) ||
        product.variants[0] ||
        null;

      this.currentVariant =
        startingVariant;

      if (startingVariant) {
        this.selectedOptions =
          this.getVariantOptions(
            startingVariant
          );
      } else {
        this.selectedOptions =
          this.getDefaultOptionValues(
            product
          );
      }

      this.renderProductInfo(product);
      this.renderOptions(product);
      this.updateSelectedVariant();
    }

    renderProductInfo(product) {
      if (this.titleElement) {
        this.titleElement.textContent =
          product.title || '';
      }

      if (this.descriptionElement) {
        this.descriptionElement.textContent =
          this.htmlToPlainText(
            product.description || ''
          );
      }

      this.updateProductImage(
        this.getProductImage(product)
      );
    }

    getProductImage(product) {
      if (product.featured_image) {
        if (
          typeof product.featured_image ===
          'string'
        ) {
          return {
            src: product.featured_image,
            alt: product.title || ''
          };
        }

        if (
          typeof product.featured_image ===
          'object'
        ) {
          return {
            src:
              product.featured_image.src ||
              '',
            alt:
              product.featured_image.alt ||
              product.title ||
              ''
          };
        }
      }

      if (
        Array.isArray(product.images) &&
        product.images.length
      ) {
        const firstImage =
          product.images[0];

        if (
          typeof firstImage === 'string'
        ) {
          return {
            src: firstImage,
            alt: product.title || ''
          };
        }

        if (
          firstImage &&
          firstImage.src
        ) {
          return {
            src: firstImage.src,
            alt:
              firstImage.alt ||
              product.title ||
              ''
          };
        }
      }

      return null;
    }

    getVariantImage(variant) {
      const image =
        variant?.featured_image;

      if (!image) {
        return null;
      }

      if (typeof image === 'string') {
        return {
          src: image,
          alt:
            this.currentProduct?.title ||
            ''
        };
      }

      return {
        src: image.src || '',
        alt:
          image.alt ||
          this.currentProduct?.title ||
          ''
      };
    }

    updateProductImage(image) {
      if (!this.imageElement) {
        return;
      }

      if (!image || !image.src) {
        this.imageElement.removeAttribute(
          'src'
        );

        this.imageElement.alt = '';

        return;
      }

      this.imageElement.src = image.src;

      this.imageElement.alt =
        image.alt ||
        this.currentProduct?.title ||
        '';
    }

    htmlToPlainText(html) {
      const element =
        document.createElement('div');

      element.innerHTML = html;

      return (
        element.textContent ||
        element.innerText ||
        ''
      ).trim();
    }

    getOptionNames(product) {
      if (
        !Array.isArray(product.options)
      ) {
        return [];
      }

      return product.options.map(
        (option, index) => {
          if (
            typeof option === 'string'
          ) {
            return option;
          }

          if (
            option &&
            typeof option.name ===
              'string'
          ) {
            return option.name;
          }

          return `Option ${index + 1}`;
        }
      );
    }

    getVariantOptions(variant) {
      if (
        Array.isArray(variant.options)
      ) {
        return variant.options.map(
          (value) =>
            value == null
              ? ''
              : String(value)
        );
      }

      return [
        variant.option1,
        variant.option2,
        variant.option3
      ]
        .filter(
          (value) => value != null
        )
        .map(String);
    }

    getOptionValues(
      product,
      optionIndex
    ) {
      const seen = new Set();
      const values = [];

      product.variants.forEach(
        (variant) => {
          const options =
            this.getVariantOptions(
              variant
            );

          const value =
            options[optionIndex];

          if (
            value != null &&
            value !== '' &&
            !seen.has(value)
          ) {
            seen.add(value);
            values.push(value);
          }
        }
      );

      return values;
    }

    getDefaultOptionValues(product) {
      const names =
        this.getOptionNames(product);

      return names.map(
        (_, index) =>
          this.getOptionValues(
            product,
            index
          )[0] || ''
      );
    }

    renderOptions(product) {
      if (!this.optionsElement) {
        return;
      }

      this.optionsElement.replaceChildren();

      const optionNames =
        this.getOptionNames(product);

      optionNames.forEach(
        (optionName, index) => {
          const values =
            this.getOptionValues(
              product,
              index
            );

          if (index === 0) {
            this.renderFirstOption(
              optionName,
              values,
              index
            );
          } else {
            this.renderSelectOption(
              optionName,
              values,
              index
            );
          }
        }
      );
    }

    renderFirstOption(
      name,
      values,
      index
    ) {
      const fieldset =
        document.createElement(
          'fieldset'
        );

      fieldset.className =
        'gift-guide-modal__option-group';

      const legend =
        document.createElement(
          'legend'
        );

      legend.className =
        'gift-guide-modal__option-label';

      legend.textContent = name;

      const valuesWrapper =
        document.createElement('div');

      valuesWrapper.className =
        'gift-guide-modal__option-values';

      values.forEach((value) => {
        const button =
          document.createElement(
            'button'
          );

        button.type = 'button';

        button.className =
          'gift-guide-modal__option-button';

        button.dataset.giftOptionButton =
          '';

        button.dataset.optionIndex =
          String(index);

        button.dataset.optionValue =
          String(value);

        button.textContent =
          String(value);

        const selected =
          String(
            this.selectedOptions[index]
          ) === String(value);

        button.setAttribute(
          'aria-pressed',
          selected
            ? 'true'
            : 'false'
        );

        valuesWrapper.appendChild(
          button
        );
      });

      fieldset.appendChild(legend);
      fieldset.appendChild(
        valuesWrapper
      );

      this.optionsElement.appendChild(
        fieldset
      );
    }

    renderSelectOption(
      name,
      values,
      index
    ) {
      const wrapper =
        document.createElement('div');

      wrapper.className =
        'gift-guide-modal__option-group';

      const label =
        document.createElement('label');

      label.className =
        'gift-guide-modal__option-label';

      const sectionId =
        this.root.dataset.sectionId ||
        'section';

      const selectId =
        `GiftGuideOption-${sectionId}-${index}`;

      label.htmlFor = selectId;
      label.textContent = name;

      const select =
        document.createElement(
          'select'
        );

      select.id = selectId;

      select.className =
        'gift-guide-modal__option-select';

      select.dataset.giftOptionSelect =
        '';

      select.dataset.optionIndex =
        String(index);

      values.forEach((value) => {
        const option =
          document.createElement(
            'option'
          );

        option.value =
          String(value);

        option.textContent =
          String(value);

        if (
          String(
            this.selectedOptions[index]
          ) === String(value)
        ) {
          option.selected = true;
        }

        select.appendChild(option);
      });

      wrapper.appendChild(label);
      wrapper.appendChild(select);

      this.optionsElement.appendChild(
        wrapper
      );
    }

    updateButtonStates(index) {
      if (!this.optionsElement) {
        return;
      }

      const buttons =
        this.optionsElement.querySelectorAll(
          `[data-gift-option-button][data-option-index="${index}"]`
        );

      buttons.forEach((button) => {
        const selected =
          String(
            button.dataset.optionValue
          ) ===
          String(
            this.selectedOptions[index]
          );

        button.setAttribute(
          'aria-pressed',
          selected
            ? 'true'
            : 'false'
        );
      });
    }

    findSelectedVariant() {
      if (!this.currentProduct) {
        return null;
      }

      return (
        this.currentProduct.variants.find(
          (variant) => {
            const variantOptions =
              this.getVariantOptions(
                variant
              );

            if (
              variantOptions.length !==
              this.selectedOptions.length
            ) {
              return false;
            }

            return variantOptions.every(
              (value, index) =>
                String(value) ===
                String(
                  this.selectedOptions[
                    index
                  ]
                )
            );
          }
        ) || null
      );
    }

    updateSelectedVariant() {
      const variant =
        this.findSelectedVariant();

      this.currentVariant = variant;

      if (!variant) {
        if (this.priceElement) {
          this.priceElement.textContent =
            'Unavailable';
        }

        if (this.statusElement) {
          this.statusElement.textContent =
            'This option combination is unavailable.';
        }

        if (this.addButton) {
          this.addButton.disabled = true;
        }

        if (this.addLabel) {
          this.addLabel.textContent =
            'UNAVAILABLE';
        }

        this.updateProductImage(
          this.getProductImage(
            this.currentProduct
          )
        );

        return;
      }

      if (this.priceElement) {
        this.priceElement.textContent =
          this.formatMoney(
            variant.price
          );
      }

      const variantImage =
        this.getVariantImage(
          variant
        );

      this.updateProductImage(
        variantImage ||
          this.getProductImage(
            this.currentProduct
          )
      );

      if (variant.available) {
        if (this.statusElement) {
          this.statusElement.textContent =
            'In stock';
        }

        if (this.addButton) {
          this.addButton.disabled =
            this.isSubmitting;
        }

        if (
          this.addLabel &&
          !this.isSubmitting
        ) {
          this.addLabel.textContent =
            this.defaultAddLabel;
        }
      } else {
        if (this.statusElement) {
          this.statusElement.textContent =
            'Sold out';
        }

        if (this.addButton) {
          this.addButton.disabled = true;
        }

        if (this.addLabel) {
          this.addLabel.textContent =
            'SOLD OUT';
        }
      }
    }

    formatMoney(cents) {
      const amount =
        Number(cents || 0) / 100;

      try {
        return new Intl.NumberFormat(
          document.documentElement.lang ||
            'en',
          {
            style: 'currency',
            currency: this.currency
          }
        ).format(amount);
      } catch (error) {
        return `${this.currency} ${amount.toFixed(
          2
        )}`;
      }
    }

    qualifiesForBonus(variant) {
      if (!variant) {
        return false;
      }

      const values =
        this.getVariantOptions(
          variant
        ).map((value) =>
          String(value)
            .trim()
            .toLowerCase()
        );

      return (
        values.includes('black') &&
        values.includes('medium')
      );
    }

    getBonusVariantId() {
      const value =
        this.root.dataset
          .bonusVariantId;

      if (!value) {
        return null;
      }

      const id = Number(value);

      return Number.isFinite(id)
        ? id
        : null;
    }

    getBonusProductId() {
      const value =
        this.root.dataset
          .bonusProductId;

      if (!value) {
        return null;
      }

      const id = Number(value);

      return Number.isFinite(id)
        ? id
        : null;
    }

    getBonusProductTitle() {
      return (
        this.root.dataset
          .bonusProductTitle ||
        'Soft Winter Jacket'
      );
    }

    bonusProductAvailable() {
      return (
        this.root.dataset
          .bonusVariantAvailable ===
        'true'
      );
    }

    shouldAddBonusProduct() {
      if (
        !this.currentVariant ||
        !this.currentProduct
      ) {
        return false;
      }

      if (
        !this.qualifiesForBonus(
          this.currentVariant
        )
      ) {
        return false;
      }

      const bonusVariantId =
        this.getBonusVariantId();

      if (!bonusVariantId) {
        return false;
      }

      if (
        !this.bonusProductAvailable()
      ) {
        return false;
      }

      const bonusProductId =
        this.getBonusProductId();

      /*
       * Prevent Soft Winter Jacket
       * adding itself as another line.
       */
      if (
        bonusProductId &&
        Number(
          this.currentProduct.id
        ) === bonusProductId
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
          id: this.getBonusVariantId(),
          quantity: 1
        });
      }

      return items;
    }

    async addToCart() {
      if (
        !this.currentVariant ||
        !this.currentVariant.available ||
        !this.currentProduct ||
        this.isSubmitting
      ) {
        return;
      }

      this.isSubmitting = true;

      if (this.addButton) {
        this.addButton.disabled = true;
      }

      if (this.addLabel) {
        this.addLabel.textContent =
          'ADDING...';
      }

      const addBonus =
        this.shouldAddBonusProduct();

      if (this.statusElement) {
        if (addBonus) {
          this.statusElement.textContent =
            `Adding ${this.currentProduct.title} and ${this.getBonusProductTitle()} to your cart...`;
        } else {
          this.statusElement.textContent =
            `Adding ${this.currentProduct.title} to your cart...`;
        }
      }

      try {
        const response = await fetch(
          `${this.routesRoot}cart/add.js`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json'
            },

            body: JSON.stringify({
              items:
                this.buildCartItems()
            })
          }
        );

        let responseData = null;

        try {
          responseData =
            await response.json();
        } catch (error) {
          responseData = null;
        }

        if (!response.ok) {
          const message =
            responseData?.description ||
            responseData?.message ||
            'The product could not be added to your cart.';

          throw new Error(message);
        }

        if (this.addLabel) {
          this.addLabel.textContent =
            'ADDED';
        }

        if (this.statusElement) {
          if (addBonus) {
            this.statusElement.textContent =
              `${this.currentProduct.title} and ${this.getBonusProductTitle()} were added to your cart.`;
          } else {
            this.statusElement.textContent =
              `${this.currentProduct.title} was added to your cart.`;
          }
        }

        document.dispatchEvent(
          new CustomEvent(
            'ee-test:cart-added',
            {
              detail: responseData
            }
          )
        );

        window.setTimeout(() => {
          if (
            !this.isOpen ||
            !this.currentVariant
          ) {
            return;
          }

          if (
            this.currentVariant
              .available
          ) {
            if (this.addButton) {
              this.addButton.disabled =
                false;
            }

            if (this.addLabel) {
              this.addLabel.textContent =
                this.defaultAddLabel;
            }
          }
        }, 1800);
      } catch (error) {
        console.error(
          'Gift guide cart error:',
          error
        );

        if (this.statusElement) {
          this.statusElement.textContent =
            error instanceof Error &&
            error.message
              ? error.message
              : 'Something went wrong. Please try again.';
        }

        if (
          this.currentVariant &&
          this.currentVariant.available
        ) {
          if (this.addButton) {
            this.addButton.disabled =
              false;
          }

          if (this.addLabel) {
            this.addLabel.textContent =
              this.defaultAddLabel;
          }
        }
      } finally {
        this.isSubmitting = false;
      }
    }

    showModal() {
      if (!this.modal) {
        return;
      }

      this.modal.hidden = false;

      this.modal.setAttribute(
        'aria-hidden',
        'false'
      );

      this.isOpen = true;

      this.bodyOverflowBeforeOpen =
        document.body.style.overflow;

      document.body.style.overflow =
        'hidden';

      window.requestAnimationFrame(
        () => {
          const closeButton =
            this.modal.querySelector(
              '.gift-guide-modal__close'
            );

          if (closeButton) {
            closeButton.focus();
          } else if (this.dialog) {
            this.dialog.focus();
          }
        }
      );
    }

    closeModal(
      restoreFocus = true
    ) {
      if (!this.modal) {
        return;
      }

      this.modal.hidden = true;

      this.modal.setAttribute(
        'aria-hidden',
        'true'
      );

      this.isOpen = false;

      document.body.style.overflow =
        this.bodyOverflowBeforeOpen ||
        '';

      this.bodyOverflowBeforeOpen =
        '';

      const trigger =
        this.currentTrigger;

      this.currentProduct = null;
      this.currentVariant = null;
      this.selectedOptions = [];
      this.currentTrigger = null;

      if (this.statusElement) {
        this.statusElement.textContent =
          '';
      }

      if (
        restoreFocus &&
        trigger &&
        trigger.isConnected
      ) {
        trigger.focus();
      }
    }

    showLoading() {
      if (this.dialog) {
        this.dialog.setAttribute(
          'aria-busy',
          'true'
        );
      }

      if (this.loadingElement) {
        this.loadingElement.hidden =
          false;
      }

      if (this.errorElement) {
        this.errorElement.hidden =
          true;
      }

      if (this.contentElement) {
        this.contentElement.hidden =
          true;
      }
    }

    showContent() {
      if (this.dialog) {
        this.dialog.setAttribute(
          'aria-busy',
          'false'
        );
      }

      if (this.loadingElement) {
        this.loadingElement.hidden =
          true;
      }

      if (this.errorElement) {
        this.errorElement.hidden =
          true;
      }

      if (this.contentElement) {
        this.contentElement.hidden =
          false;
      }
    }

    showError() {
      if (this.dialog) {
        this.dialog.setAttribute(
          'aria-busy',
          'false'
        );
      }

      if (this.loadingElement) {
        this.loadingElement.hidden =
          true;
      }

      if (this.contentElement) {
        this.contentElement.hidden =
          true;
      }

      if (this.errorElement) {
        this.errorElement.hidden =
          false;
      }
    }

    trapFocus(event) {
      if (!this.dialog) {
        return;
      }

      const focusableSelector = [
        'a[href]',
        'button:not([disabled])',
        'select:not([disabled])',
        'input:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
      ].join(',');

      const focusable =
        Array.from(
          this.dialog.querySelectorAll(
            focusableSelector
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

      const first =
        focusable[0];

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
  }

  function initGrid(root) {
    if (
      !root ||
      instances.has(root)
    ) {
      return;
    }

    const instance =
      new GiftGuideGrid(root);

    instances.set(
      root,
      instance
    );
  }

  function destroyGrid(root) {
    const instance =
      instances.get(root);

    if (!instance) {
      return;
    }

    instance.destroy();
    instances.delete(root);
  }

  function initAll(scope = document) {
    if (
      scope.matches &&
      scope.matches(SELECTORS.grid)
    ) {
      initGrid(scope);
    }

    scope
      .querySelectorAll?.(
        SELECTORS.grid
      )
      .forEach(initGrid);
  }

  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      () => initAll(document),
      {
        once: true
      }
    );
  } else {
    initAll(document);
  }

  document.addEventListener(
    'shopify:section:load',
    (event) => {
      initAll(event.target);
    }
  );

  document.addEventListener(
    'shopify:section:unload',
    (event) => {
      if (
        event.target.matches?.(
          SELECTORS.grid
        )
      ) {
        destroyGrid(
          event.target
        );
      }

      event.target
        .querySelectorAll?.(
          SELECTORS.grid
        )
        .forEach(destroyGrid);
    }
  );
})();