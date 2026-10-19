package io.polarlights.app;

import android.os.CancellationSignal;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

/**
 * Sign in with Google in the app. Google doesn't allow its sign-in page inside an app's web view, so
 * the site asks this plugin instead: Android's account picker returns a Google ID token, which the site
 * passes to Supabase (signInWithIdToken). Called as Capacitor.Plugins.GoogleSignIn.signIn with
 * { clientId, nonce }: clientId is the Google *web* client ID Supabase uses, nonce the SHA-256 (hex) of
 * the nonce the site sends to Supabase.
 */
@CapacitorPlugin(name = "GoogleSignIn")
public class GoogleSignInPlugin extends Plugin {

    @PluginMethod
    public void signIn(PluginCall call) {
        String clientId = call.getString("clientId");
        if (clientId == null || clientId.isEmpty()) {
            call.reject("Missing Google client ID", "config");
            return;
        }
        GetSignInWithGoogleOption.Builder option = new GetSignInWithGoogleOption.Builder(clientId);
        String nonce = call.getString("nonce");
        if (nonce != null && !nonce.isEmpty()) option.setNonce(nonce);
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option.build()).build();

        CredentialManager.create(getContext()).getCredentialAsync(
            getActivity(),
            request,
            new CancellationSignal(),
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse response) {
                    Credential credential = response.getCredential();
                    if (credential instanceof CustomCredential && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                        try {
                            GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(credential.getData());
                            JSObject ret = new JSObject();
                            ret.put("idToken", google.getIdToken());
                            ret.put("email", google.getId());
                            call.resolve(ret);
                        } catch (Exception e) {
                            call.reject("Couldn't read the Google sign-in", "failed", e);
                        }
                    } else {
                        call.reject("Unexpected sign-in result", "failed");
                    }
                }

                @Override
                public void onError(@NonNull GetCredentialException e) {
                    if (e instanceof GetCredentialCancellationException) call.reject("Sign-in cancelled", "cancelled");
                    else if (e instanceof NoCredentialException) call.reject("No Google account on this device", "no_account", e);
                    else call.reject(e.getMessage() != null ? e.getMessage() : "Google sign-in failed", "failed", e);
                }
            }
        );
    }
}
