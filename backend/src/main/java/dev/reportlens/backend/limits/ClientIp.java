package dev.reportlens.backend.limits;

import java.util.Set;

/**
 * The client's IP address for rate limiting. Behind nginx every request comes from the
 * proxy's address, so the real client is in X-Forwarded-For; but anyone can send that
 * header, so it is read only when the request comes from a trusted proxy. nginx
 * overwrites the header with the address it sees, so the last value is the client.
 */
public final class ClientIp {

    private ClientIp() {
    }

    public static String resolve(String remoteAddr, String forwardedFor, Set<String> trustedProxies) {
        if (forwardedFor == null || forwardedFor.isBlank() || !trustedProxies.contains(remoteAddr)) {
            return remoteAddr;
        }
        String[] hops = forwardedFor.split(",");
        String client = hops[hops.length - 1].strip();
        return client.isEmpty() ? remoteAddr : client;
    }
}
