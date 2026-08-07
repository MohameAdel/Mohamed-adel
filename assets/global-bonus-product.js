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