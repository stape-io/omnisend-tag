# Omnisend Tag for GTM Server-Side

Use this Tag to send Contact and Event data to Omnisend via the Omnisend API (version `2026-03-15`).

## Warning: API Rate Limiting

The Omnisend API limits requests to **400 per minute** per brand. High-volume events (e.g., `viewed product`, `added product to cart`, `started checkout`) are better tracked using the client-side Javascript snippet to avoid hitting this limit.

## Action Types

### Track Event
Sends an event to Omnisend, creating or updating the contact as needed.
**Event Names**:
*   **Standard**: Predefined list (e.g., `viewed product`, `placed order`).
*   **Inherit**: Maps GA4 events (e.g., `purchase` -> `placed order`).
*   **Custom**: Your own event name.

### Create Contact
Creates a new contact using a unique identifier (Email or Phone).
*   **Duplicates**: If a contact with the provided Email already exists, that contact is updated instead of a new one being created.
*   **Options**: Can store the created Contact ID in a cookie for future use.

### Update Contact
Updates an existing contact found via **Omnisend Contact ID** or **Email**.
*   **Search Key**: Choose ID to allow email updates, or Email (ID remains unchanged).
*   **Properties**: Only provide the specific fields you want to update.

> ⚠️ **Contact Tags**: On **Create Contact** and **Update Contact**, the tags sent **replace** all existing tags of the contact. Include every tag the contact should keep. On **Track Event**, tags are appended to the existing ones.

> **Send Welcome Message**: When set, it's applied to each identifier (Email/Phone) sent on Create/Update Contact. If not set, Omnisend sends a welcome message when a channel is set to `subscribed` and the welcome workflow is enabled.

## Configuration

*   **API Key**: Required. Obtained from [_Omnisend Store Settings > API > API Keys_](https://app.omnisend.com/integrations/api-keys). Needs permissions for `Contacts` and `Events`.
*   **Use Optimistic Scenario**: If enabled, the tag returns "Success" immediately without waiting for the API response.

## Useful Resources

- [Omnisend API Rate Limiting](https://api-docs.omnisend.com/reference/rate-limit-timeouts-errors)
- [Omnisend API Events](https://api-docs.omnisend.com/reference/events)
- [Omnisend API Contacts](https://api-docs.omnisend.com/reference/contacts)
- [Migrate from v5 to v2026-03-15](https://api-docs.omnisend.com/docs/migrate-from-v5-to-v2026-03-15)

## Open Source

The **Omnisend Tag for GTM Server Side** is developed and maintained by the [Stape Team](https://stape.io/) under the Apache 2.0 license.

### GTM Gallery Status
🟢 [Listed](https://tagmanager.google.com/gallery/#/owners/stape-io/templates/omnisend-tag)
