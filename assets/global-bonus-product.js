(() => {
  'use strict';

  /*
   * GLOBAL BONUS PRODUCT
   *
   * Rule:
   * If the cart contains a product variant
   * with BOTH "Black" and "Medium",
   * automatically add "Soft Winter Jacket".
   *
   * IMPORTANT:
   * Change this handle if the Shopify product
   * handle is different.
   */
  const BONUS_PRODUCT_HANDLE =
    'soft-winter-jacket';

  const QUALIFYING_VALUES = [
    'black',
    'medium'
  ];

  const routesRoot =
    window.Shopify &&
    window.Shopify.routes &&
    window.Shopify.routes.root
      ? window.Shopify.routes.root
      : '/';

  /*
   * Keep the original fetch.
   * We use this internally so adding the
   * bonus product does not trigger our
   * own fetch interceptor again.
   */
  const originalFetch =
    window.fetch.bind(window);

  let bonusProductPromise = null;
  let syncPromise = null;

  /*
   * Normalize option values.
   */
  function normalizeValue(value) {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  /*
   * Get all variant option values
   * from a Shopify cart item.
   */
  function getCartItemOptionValues(item) {
    if (
      !item ||
      !Array.isArray(item.options_with_values)
    ) {
      return [];
    }

    return item.options_with_values
      .map((option) =>
        normalizeValue(option?.value)
      )
      .filter(Boolean);
  }

  /*
   * Check:
   * Does this cart item contain
   * BOTH Black and Medium?
   */
  function qualifiesForBonus(item) {
    if (!item) {
      return false;
    }

    const values =
      getCartItemOptionValues(item);

    return QUALIFYING_VALUES.every(
      (requiredValue) =>
        values.includes(requiredValue)
    );
  }

  /*
   * Fetch Soft Winter Jacket product data.
   */
  async function getBonusProduct() {
    if (bonusProductPromise) {
      return bonusProductPromise;
    }

    bonusProductPromise =
      originalFetch(
        `${routesRoot}products/${encodeURIComponent(
          BONUS_PRODUCT_HANDLE
        )}.js`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          }
        }
      )
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              `Bonus product request failed: ${response.status}`
            );
          }

          return response.json();
        })
        .then((product) => {
          if (
            !product ||
            !Array.isArray(product.variants)
          ) {
            throw new Error(
              'Invalid bonus product data.'
            );
          }

          return product;
        })
        .catch((error) => {
          /*
           * Allow another attempt later
           * if this request failed.
           */
          bonusProductPromise = null;

          throw error;
        });

    return bonusProductPromise;
  }

  /*
   * Get the first available variant
   * of Soft Winter Jacket.
   */
  async function getBonusVariant() {
    const product =
      await getBonusProduct();

    return (
      product.variants.find(
        (variant) => variant.available
      ) || null
    );
  }

  /*
   * Get current Shopify cart.
   */
  async function getCart() {
    const response =
      await originalFetch(
        `${routesRoot}cart.js`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          }
        }
      );

    if (!response.ok) {
      throw new Error(
        `Cart request failed: ${response.status}`
      );
    }

    return response.json();
  }

  /*
   * Check if Soft Winter Jacket
   * is already inside the cart.
   */
  function bonusProductAlreadyInCart(
    cart,
    bonusProductId
  ) {
    if (
      !cart ||
      !Array.isArray(cart.items)
    ) {
      return false;
    }

    return cart.items.some(
      (item) =>
        Number(item.product_id) ===
        Number(bonusProductId)
    );
  }

  /*
   * Check if ANY non-bonus product
   * currently in the cart qualifies.
   */
  function cartHasQualifyingProduct(
    cart,
    bonusProductId
  ) {
    if (
      !cart ||
      !Array.isArray(cart.items)
    ) {
      return false;
    }

    return cart.items.some((item) => {
      /*
       * Prevent Soft Winter Jacket
       * from qualifying itself.
       */
      if (
        Number(item.product_id) ===
        Number(bonusProductId)
      ) {
        return false;
      }

      return qualifiesForBonus(item);
    });
  }

  /*
   * Add Soft Winter Jacket.
   */
  async function addBonusVariant(
    variantId
  ) {
    const response =
      await originalFetch(
        `${routesRoot}cart/add.js`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            Accept:
              'application/json'
          },

          body: JSON.stringify({
            items: [
              {
                id: variantId,
                quantity: 1
              }
            ]
          })
        }
      );

    let data = null;

    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      throw new Error(
        data?.description ||
        data?.message ||
        'Soft Winter Jacket could not be added.'
      );
    }

    /*
     * Optional event.
     * Other theme code can listen to it.
     */
    document.dispatchEvent(
      new CustomEvent(
        'global-bonus:added',
        {
          detail: data
        }
      )
    );

    return data;
  }

  /*
   * Main global controller.
   */
  async function performBonusSync() {
    const bonusProduct =
      await getBonusProduct();

    const bonusVariant =
      await getBonusVariant();

    /*
     * Bonus product unavailable.
     */
    if (
      !bonusVariant ||
      !bonusVariant.available
    ) {
      return;
    }

    const cart =
      await getCart();

    /*
     * Soft Winter Jacket
     * already exists.
     *
     * Do not add another copy.
     */
    if (
      bonusProductAlreadyInCart(
        cart,
        bonusProduct.id
      )
    ) {
      return;
    }

    /*
     * No Black + Medium item.
     */
    if (
      !cartHasQualifyingProduct(
        cart,
        bonusProduct.id
      )
    ) {
      return;
    }

    /*
     * Qualifying item exists.
     * Add the bonus.
     */
    await addBonusVariant(
      bonusVariant.id
    );
  }

  /*
   * Prevent multiple simultaneous
   * bonus checks.
   */
  function syncBonusProduct() {
    if (syncPromise) {
      return syncPromise;
    }

    syncPromise =
      performBonusSync()
        .catch((error) => {
          console.error(
            'Global bonus product error:',
            error
          );
        })
        .finally(() => {
          syncPromise = null;
        });

    return syncPromise;
  }

  /*
   * Detect Shopify cart/add.js calls.
   */
  function isCartAddRequest(input) {
    let url = '';

    if (typeof input === 'string') {
      url = input;
    } else if (
      input &&
      typeof input.url === 'string'
    ) {
      url = input.url;
    }

    if (!url) {
      return false;
    }

    try {
      const parsed =
        new URL(
          url,
          window.location.origin
        );

      return (
        parsed.pathname.endsWith(
          '/cart/add.js'
        ) ||
        parsed.pathname.endsWith(
          '/cart/add'
        )
      );
    } catch (error) {
      return (
        url.includes('/cart/add.js') ||
        url.includes('/cart/add')
      );
    }
  }

  /*
   * ------------------------------------------------
   * FETCH INTERCEPTOR
   * ------------------------------------------------
   *
   * Covers modern Shopify themes,
   * Quick Add, product forms using fetch,
   * custom AJAX sections, etc.
   */
  window.fetch =
    async function (...args) {
      const cartAddRequest =
        isCartAddRequest(args[0]);

      const response =
        await originalFetch(...args);

      if (
        cartAddRequest &&
        response.ok
      ) {
        /*
         * Wait until bonus product has
         * been processed before returning
         * control to the theme.
         *
         * This helps cart drawers refresh
         * with the bonus already present.
         */
        await syncBonusProduct();
      }

      return response;
    };

  /*
   * ------------------------------------------------
   * XHR INTERCEPTOR
   * ------------------------------------------------
   *
   * Covers older themes/apps using
   * XMLHttpRequest instead of fetch.
   */
  if (window.XMLHttpRequest) {
    const OriginalXHR =
      window.XMLHttpRequest;

    const originalOpen =
      OriginalXHR.prototype.open;

    const originalSend =
      OriginalXHR.prototype.send;

    OriginalXHR.prototype.open =
      function (
        method,
        url,
        ...rest
      ) {
        this.__globalBonusCartAdd =
          isCartAddRequest(url);

        return originalOpen.call(
          this,
          method,
          url,
          ...rest
        );
      };

    OriginalXHR.prototype.send =
      function (...args) {
        if (
          this.__globalBonusCartAdd
        ) {
          this.addEventListener(
            'loadend',
            () => {
              if (
                this.status >= 200 &&
                this.status < 300
              ) {
                syncBonusProduct();
              }
            },
            {
              once: true
            }
          );
        }

        return originalSend.apply(
          this,
          args
        );
      };
  }

  /*
   * ------------------------------------------------
   * PAGE LOAD CHECK
   * ------------------------------------------------
   *
   * Important for normal Shopify forms
   * which reload/navigate after
   * Add to Cart.
   *
   * If Black + Medium entered the cart
   * through a normal form submission,
   * this check catches it on the next page.
   */
  function init() {
    syncBonusProduct();
  }

  if (
    document.readyState === 'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      init,
      {
        once: true
      }
    );
  } else {
    init();
  }

  /*
   * Expose a manual sync API.
   *
   * Useful if another custom section/app
   * changes the cart without using
   * Shopify cart/add.js.
   *
   * Example:
   *
   * window.GlobalBonusProduct.sync();
   */
  window.GlobalBonusProduct = {
    sync: syncBonusProduct
  };
})();