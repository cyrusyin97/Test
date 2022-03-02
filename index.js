/**
 * Created by hoangnh on 9/18/17.
 */

// @flow
import React from 'react';
import { MODULES } from 'App/Constants';

import { View, ScrollView } from 'react-native';
import i18n from 'App/Utils/shopeei18n';
import ActionBar from 'App/Components/Widgets/ActionBar';
import ShopeeContainer from 'App/ShopeeContainer';
import PageComponent from 'App/Components/PageComponent';
import { FlashSaleItem } from '@shopee/rn-flash-sale-components';
import ProductAlsoLike from 'App/Components/ProductRecommendation/Components/ProductAlsoLike';
import { RNRefreshControl } from 'SRNPlatform/NativeViews';
import { Dialog } from 'SRNPlatform/NativeModules';

import { fetchItem } from 'shared/redux/item/actions';
import { RECOMMEND_TYPE } from 'shared/redux/recommendation/constants';
import { fetchRecommendItems } from 'shared/redux/recommendation/actions';
import recommendationReducer from 'shared/redux/recommendation/reducer';
import { CONF_KEYS, getConf } from 'App/Utils/CCMSConfig';
import ProductPageHelper from 'App/Product/Helpers/ProductPageHelper';
import { getCurrentUser } from 'App/redux/selectors';
import { login } from 'App/redux/user/actions';
import { getRecommendationKey } from 'shared/utils/recommend_utils';
import { combineReducers } from 'redux';
import { getItemWithPlaceholder } from 'App/Product/Helpers/DefaultProductHandler.js';
import itemReducer from 'shared/redux/item/reducer';
import { parsePropsString } from 'App/Utils/Common';
import { handleItemCardClick } from 'App/Item/helpers';
import getIn from '@shopee/get-in';
import type { ItemDetail } from '@shopee/flow-types';
import type { RecommendResult } from 'shared/FlowType/Recommend';
import {
  flashSaleActions,
  flashSaleReducer,
  brandSaleActions,
  brandSaleReducer,
} from '@shopee/rn-flash-sale-redux';

import {
  fetchAllFsSoldoutRcmd,
  fsSoldoutRcmdReducer,
  getStateKey,
  FsSoldoutRcmdStore,
} from '@shopee/fs-soldout-rcmd-redux';
import { FS_SOLDOUT_PAGE_RCMD_BFF_API as FEATURE_TOGGLES_FS_SOLDOUT_PAGE_RCMD_BFF_API } from '@shopee/feature-toggle-constants';

import { isUserEnabled } from 'App/redux/conf/selector';

import { ScrollViewIntersectionContainer } from 'SRNPlatform/Components/ScrollViewIntersection';
const RECOMEND_ITEM_COUNT = 12;
const {
  fetchFlashSaleItemsSoldoutPage,
  fetchShopBatchFlashSaleItems,
} = flashSaleActions;
const { fetchBrandSaleItems } = brandSaleActions;

type Props = {
  rootTag: mixed,
  isFsSoldoutRcmdBff: boolean,
  shopid: number,
  itemid: number,
  currentUser: mixed,
  recommendationV2: { [key: string]: RecommendResult },
  recommendationV4: { [key: string]: FsSoldoutRcmdStore },
  items: { [key: number]: ItemDetail },
  fetchItem: typeof fetchItem,
  fetchRecommendItems: typeof fetchRecommendItems,
  fetchAllFsSoldoutRcmd: typeof fetchAllFsSoldoutRcmd,
  fetchFlashSaleItemsSoldoutPage: typeof fetchFlashSaleItemsSoldoutPage,
  flashSaleItems: any,
  fetchBrandSaleItems: typeof fetchBrandSaleItems,
  fetchShopBatchFlashSaleItems: typeof fetchShopBatchFlashSaleItems,
};

type State = {
  refreshing: boolean,
  flashsaleItem: any,
};

class SimilarProductPage extends PageComponent {
  props: Props;
  state: State;

  handleRefresh: Function;
  onPressItem: Function;

  constructor(props) {
    super(props);

    this.handleRefresh = this.handleRefresh.bind(this);
    this.onPressItem = this.onPressItem.bind(this);

    this.state = {
      refreshing: false,
    };
  }

  componentDidMount() {
    this.refreshPage(true);
  }

  handleRefresh() {
    this.setState({ refreshing: true });
    this.refreshPage(false);
  }

  async refreshPage(isFirstLoad: boolean) {
    const { shopid, itemid } = this.props;
    const { from, refer_page, promotionid } = this.props.propsData;
    const fromPage = from ? from : refer_page;

    await this.props.fetchItem(shopid, itemid, {
      forceFetch: true,
      fromFlashSale: true,
    });

    const item = this.props.items[itemid];
    let res = {};
    let displayItem = {};

    switch (fromPage) {
      case 'flash_sale':
        res = await this.props.fetchFlashSaleItemsSoldoutPage({
          promotionId: promotionid,
          itemIds: [itemid],
          sortSoldout: true,
          limit: 1,
        });
        this.setState({ flashsaleItem: res.response.data.items[0] });
        break;

      case 'brand_sale':
        res = await this.props.fetchBrandSaleItems({
          promotionIds: [promotionid],
          shopIds: [shopid],
          sortSoldout: true,
        });
        displayItem = res.response.data[0].item_groups[0].items.find(
          item => item.itemid === itemid
        );
        this.setState({ flashsaleItem: displayItem });
        break;

      case 'shop_flash_sale':
        res = await this.props.fetchShopBatchFlashSaleItems({
          promotionids: [promotionid],
          shopid: shopid,
          sort_soldout: true,
        });
        displayItem = res.response.data.items.find(
          item => item.itemid === itemid
        );
        this.setState({ flashsaleItem: displayItem });
        break;

      default:
        break;
    }

    if (!item) {
      if (isFirstLoad) {
        const response = await Dialog.showPopup(this.props.rootTag, {
          content: i18n.t('msg_fail_to_load'),
          okText: i18n.t('label_reload'),
        });
        if (response.action === Dialog.Action.Ok) {
          this.refreshPage(true);
        }
      }
    } else {
      const showFromSameShop = getConf(CONF_KEYS.FROM_SAME_SHOP);

      // [SPRC-5173] Use new bff api
      if (this.props.isFsSoldoutRcmdBff) {
        this.props.fetchAllFsSoldoutRcmd({
          shopId: shopid,
          itemId: itemid,
          catId: item.catid,
          limit: RECOMEND_ITEM_COUNT,
          itemCardStyle: 2,
        });
      }
      // otherwise, still use v2 api
      else {
        showFromSameShop &&
          this.props.fetchRecommendItems(
            state => state.recommendationV2,
            {
              itemId: itemid,
              shopId: shopid,
              categoryId: item.catid,
              recommendType: RECOMMEND_TYPE.FROM_SAME_SHOP,
            },
            RECOMEND_ITEM_COUNT,
            0
          );

        this.props.fetchRecommendItems(
          state => state.recommendationV2,
          {
            itemId: itemid,
            shopId: shopid,
            categoryId: item.catid,
            recommendType: RECOMMEND_TYPE.SIMILAR_PRODUCTS,
          },
          RECOMEND_ITEM_COUNT,
          0
        );
      }
    }

    if (!isFirstLoad && item) {
      this.setState({
        refreshing: false,
        refreshTimestamp: new Date().getTime(),
      });
    }
  }

  onPressItem() {
    const { rootTag, itemid, items } = this.props;

    handleItemCardClick(rootTag, items[itemid], () => {}, {});
  }

  render() {
    const {
      shopid,
      itemid,
      currentUser,
      recommendationV2,
      recommendationV4,
      isFsSoldoutRcmdBff,
    } = this.props;

    const productInfo = {
      ...getItemWithPlaceholder(),
      ...this.props.items[itemid],
    };

    const flashSaleInfo = this.state.flashsaleItem
      ? this.state.flashsaleItem
      : productInfo.flash_sale
      ? productInfo.flash_sale
      : {};

    let fromSameShopList, recItemList;

    if (isFsSoldoutRcmdBff) {
      const storeKey = getStateKey(shopid, itemid, productInfo.catid);

      fromSameShopList = getIn(
        recommendationV4,
        [storeKey, 'data', 'sections', 'flashsale_ads_ftss_sec', 'data'],
        []
      );

      recItemList = getIn(
        recommendationV4,
        [storeKey, 'data', 'sections', 'flashsale_ads_sp_sec', 'data'],
        []
      );
    } else {
      const fromSameShopListKey = getRecommendationKey({
        itemId: itemid,
        shopId: shopid,
        categoryId: productInfo.catid,
        recommendType: RECOMMEND_TYPE.FROM_SAME_SHOP,
      });

      fromSameShopList =
        recommendationV2[fromSameShopListKey] &&
        recommendationV2[fromSameShopListKey].items
          ? recommendationV2[fromSameShopListKey].items
          : null;

      const recItemKey = getRecommendationKey({
        itemId: itemid,
        shopId: shopid,
        categoryId: productInfo.catid,
        recommendType: RECOMMEND_TYPE.SIMILAR_PRODUCTS,
      });

      recItemList =
        recommendationV2[recItemKey] && recommendationV2[recItemKey].items
          ? recommendationV2[recItemKey].items
          : null;
    }

    return (
      <View style={{ flex: 1 }}>
        <ActionBar title={i18n.t('label_flash_deal').toUpperCase()} />
        <ScrollViewIntersectionContainer isAlwaysVisible={true}>
          <ScrollView
            style={{ flex: 1 }}
            refreshControl={
              <RNRefreshControl
                refreshing={this.state.refreshing}
                onRefresh={this.handleRefresh}
              />
            }
          >
            {productInfo.itemid > 0 && (
              <FlashSaleItem
                item={flashSaleInfo}
                onPressItem={this.onPressItem}
              />
            )}
            <ProductAlsoLike
              targetContext="FSS"
              userSession={currentUser}
              items={fromSameShopList}
              sectionLabel={i18n.t('label_from_same_shop')}
              onMorePress={() =>
                ProductPageHelper.gotoFromSameShopSeeAll(
                  this.props.rootTag,
                  shopid,
                  itemid
                )
              }
              shopId={shopid}
              itemId={itemid}
              trackingType={'FSS'}
              catId={productInfo.catid}
            />

            <ProductAlsoLike
              targetContext="YMAL"
              userSession={currentUser}
              items={recItemList}
              sectionLabel={i18n.t('label_similar_products')}
              onMorePress={() =>
                ProductPageHelper.gotoYMALSeeMore(
                  this.props.rootTag,
                  shopid,
                  itemid,
                  productInfo.catid
                )
              }
              recommendParams={{
                itemId: itemid,
                shopId: shopid,
                categoryId: productInfo.catid,
                recommendType: RECOMMEND_TYPE.SIMILAR_PRODUCTS,
              }}
              shopId={shopid}
              itemId={itemid}
              trackingType={'YMAL'}
              catId={productInfo.catid}
            />
          </ScrollView>
        </ScrollViewIntersectionContainer>
      </View>
    );
  }
}

const mapStateToProps = state => {
  const currentUser = getCurrentUser(state);
  return {
    currentUser,
  };
};

const mapLocalStateToProps = (state, globalState, ownProps) => {
  const query = parsePropsString(ownProps.propsString, ownProps.propsEvent);

  const itemid = query.itemid;
  const shopid = query.shopid;

  return {
    itemid,
    shopid,
    recommendationV2: state.recommendationV2,
    recommendationV4: state.recommendationV4,
    items: state.items.items,
    flashSaleItems: state.flashSaleItems,
    brandSaleItems: state.brandSaleItems,
    isFsSoldoutRcmdBff: isUserEnabled(
      globalState.conf,
      FEATURE_TOGGLES_FS_SOLDOUT_PAGE_RCMD_BFF_API
    ),
  };
};

export default ShopeeContainer(
  MODULES.SIMILAR_PRODUCT_PAGE,
  SimilarProductPage,
  mapStateToProps,
  {
    login,
  },
  {
    localStore: {
      mapDispatchToProps: {
        fetchItem,
        fetchRecommendItems,
        fetchAllFsSoldoutRcmd,
        fetchFlashSaleItemsSoldoutPage,
        fetchBrandSaleItems,
        fetchShopBatchFlashSaleItems,
      },
      mapStateToProps: mapLocalStateToProps,
      reducer: combineReducers({
        recommendationV2: recommendationReducer,
        recommendationV4: fsSoldoutRcmdReducer,
        items: itemReducer,
        flashSaleItems: flashSaleReducer,
        brandSaleItems: brandSaleReducer,
      }),
    },
    disableSafeAreaInsetBottom: true,
  }
);
