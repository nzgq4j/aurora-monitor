package io.polarlights.app;

import androidx.annotation.NonNull;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

/**
 * Google Play Billing for the Chaser subscription (Google Play requires it for subscriptions bought in
 * the app). The site calls Capacitor.Plugins.PlayBilling:
 * - getProducts({ productIds }) → each product's base plans and offers, with Play's prices;
 * - purchase({ productId, offerToken, accountId }) → opens Play's purchase sheet; accountId (the user's
 *   ID) is attached to the purchase so the server can tell whose it is;
 * - queryPurchases() → the subscriptions this Google account owns.
 * Purchases are acknowledged by the server (/api/play/verify), not here.
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {

    private BillingClient client;
    private final Map<String, ProductDetails> products = new HashMap<>();
    /** Calls waiting for the connection to Play; connecting is started once for all of them. */
    private final List<Runnable> waiting = new ArrayList<>();
    private final List<PluginCall> waitingCalls = new ArrayList<>();
    private boolean connecting = false;
    /** The purchase call waiting for Play's purchase sheet to finish. */
    private PluginCall pendingPurchase;

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build();
    }

    @Override
    protected void handleOnDestroy() {
        if (client != null) client.endConnection();
    }

    private void whenConnected(PluginCall call, Runnable then) {
        if (client.isReady()) { then.run(); return; }
        synchronized (waiting) {
            waiting.add(then);
            waitingCalls.add(call);
            if (connecting) return;
            connecting = true;
        }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult result) {
                List<Runnable> runs;
                List<PluginCall> calls;
                synchronized (waiting) {
                    connecting = false;
                    runs = new ArrayList<>(waiting);
                    calls = new ArrayList<>(waitingCalls);
                    waiting.clear();
                    waitingCalls.clear();
                }
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    for (Runnable r : runs) r.run();
                } else {
                    for (PluginCall c : calls) reject(c, result);
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                // The next call connects again.
            }
        });
    }

    private static String code(int response) {
        switch (response) {
            case BillingClient.BillingResponseCode.USER_CANCELED: return "cancelled";
            case BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED: return "already_owned";
            case BillingClient.BillingResponseCode.BILLING_UNAVAILABLE:
            case BillingClient.BillingResponseCode.FEATURE_NOT_SUPPORTED:
            case BillingClient.BillingResponseCode.ITEM_UNAVAILABLE:
            case BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE: return "unavailable";
            default: return "failed";
        }
    }

    private static void reject(PluginCall call, BillingResult result) {
        String message = result.getDebugMessage();
        call.reject(message == null || message.isEmpty() ? "Google Play billing error " + result.getResponseCode() : message, code(result.getResponseCode()));
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        List<QueryProductDetailsParams.Product> list = new ArrayList<>();
        try {
            JSArray ids = call.getArray("productIds", new JSArray());
            for (int i = 0; i < ids.length(); i++) {
                list.add(QueryProductDetailsParams.Product.newBuilder().setProductId(ids.getString(i)).setProductType(BillingClient.ProductType.SUBS).build());
            }
        } catch (Exception e) {
            call.reject("Bad product IDs", "failed", e);
            return;
        }
        if (list.isEmpty()) { call.reject("No product IDs", "failed"); return; }
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder().setProductList(list).build();
        whenConnected(call, () -> client.queryProductDetailsAsync(params, (result, details) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { reject(call, result); return; }
            JSArray out = new JSArray();
            for (ProductDetails pd : details.getProductDetailsList()) {
                products.put(pd.getProductId(), pd);
                JSArray offers = new JSArray();
                List<ProductDetails.SubscriptionOfferDetails> subs = pd.getSubscriptionOfferDetails();
                if (subs != null) {
                    for (ProductDetails.SubscriptionOfferDetails o : subs) {
                        JSArray phases = new JSArray();
                        for (ProductDetails.PricingPhase ph : o.getPricingPhases().getPricingPhaseList()) {
                            JSObject p = new JSObject();
                            p.put("formattedPrice", ph.getFormattedPrice());
                            p.put("priceMicros", ph.getPriceAmountMicros());
                            p.put("currency", ph.getPriceCurrencyCode());
                            p.put("billingPeriod", ph.getBillingPeriod());
                            p.put("cycles", ph.getBillingCycleCount());
                            p.put("recurrence", ph.getRecurrenceMode());
                            phases.put(p);
                        }
                        JSObject offer = new JSObject();
                        offer.put("basePlanId", o.getBasePlanId());
                        offer.put("offerId", o.getOfferId() == null ? JSONObject.NULL : o.getOfferId());
                        offer.put("offerToken", o.getOfferToken());
                        offer.put("phases", phases);
                        offers.put(offer);
                    }
                }
                JSObject product = new JSObject();
                product.put("productId", pd.getProductId());
                product.put("offers", offers);
                out.put(product);
            }
            JSObject ret = new JSObject();
            ret.put("products", out);
            call.resolve(ret);
        }));
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        String offerToken = call.getString("offerToken");
        String accountId = call.getString("accountId");
        ProductDetails pd = productId == null ? null : products.get(productId);
        if (pd == null || offerToken == null || accountId == null) {
            call.reject("Load the product before buying it", "unavailable");
            return;
        }
        if (pendingPurchase != null) {
            call.reject("A purchase is already open", "failed");
            return;
        }
        BillingFlowParams params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(Collections.singletonList(
                BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(pd).setOfferToken(offerToken).build()))
            .setObfuscatedAccountId(accountId)
            .build();
        whenConnected(call, () -> getActivity().runOnUiThread(() -> {
            pendingPurchase = call;
            BillingResult result = client.launchBillingFlow(getActivity(), params);
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                pendingPurchase = null;
                reject(call, result);
            }
        }));
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult result, List<Purchase> purchases) {
        PluginCall call = pendingPurchase;
        pendingPurchase = null;
        // An update without an open purchase (a pending payment completing later) is picked up by
        // queryPurchases the next time the app starts.
        if (call == null) return;
        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
            call.resolve(purchasesResult(purchases));
        } else {
            reject(call, result);
        }
    }

    @PluginMethod
    public void queryPurchases(PluginCall call) {
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build();
        whenConnected(call, () -> client.queryPurchasesAsync(params, (result, purchases) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { reject(call, result); return; }
            call.resolve(purchasesResult(purchases));
        }));
    }

    private static JSObject purchasesResult(List<Purchase> purchases) {
        JSArray list = new JSArray();
        for (Purchase p : purchases) {
            JSObject o = new JSObject();
            o.put("purchaseToken", p.getPurchaseToken());
            o.put("products", new JSArray(p.getProducts()));
            int state = p.getPurchaseState();
            o.put("state", state == Purchase.PurchaseState.PURCHASED ? "purchased" : state == Purchase.PurchaseState.PENDING ? "pending" : "unspecified");
            o.put("acknowledged", p.isAcknowledged());
            o.put("accountId", p.getAccountIdentifiers() != null && p.getAccountIdentifiers().getObfuscatedAccountId() != null
                ? p.getAccountIdentifiers().getObfuscatedAccountId() : JSONObject.NULL);
            list.put(o);
        }
        JSObject ret = new JSObject();
        ret.put("purchases", list);
        return ret;
    }
}
