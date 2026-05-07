# Omnisend Tag for GTM Server-Side

Use this Tag to send Contact and Event data to Omnisend via the Omnisend API.

## Warning: API Rate Limiting

The Omnisend API limits requests to **400 per minute**. High-volume events (e.g., `viewed product`, `added product to cart`, `started checkout`) are better tracked using the client-side Javascript snippet to avoid hitting this limit.

## Action Types

### Track Event
Sends an event to Omnisend, creating or updating the contact as needed.
**Event Names**:
*   **Standard**: Predefined list (e.g., `viewed product`, `placed order`).
*   **Inherit**: Maps GA4 events (e.g., `purchase` -> `placed order`).
*   **Custom**: Your own event name.

### Create Contact
Creates a new contact using a unique identifier (Email or Phone).
*   **Duplicates**: System handles partial duplicates (merges unique IDs) and rejects total duplicates or existing single identifiers.
*   **Options**: Can store the created Contact ID in a cookie for future use.

### Update Contact
Updates an existing contact found via **Omnisend Contact ID** or **Email**.
*   **Search Key**: Choose ID to allow email updates, or Email (ID remains unchanged).
*   **Properties**: Only provide the specific fields you want to update.

## Configuration

*   **API Key**: Required. Obtained from [_Omnisend Store Settings > API > API Keys_](https://app.omnisend.com/integrations/api-keys). Needs permissions for `Contacts` and `Events`.
*   **Use Optimistic Scenario**: If enabled, the tag returns "Success" immediately without waiting for the API response.

## Useful Resources

- [Omnisend API Rate Limiting](https://api-docs.omnisend.com/reference/rate-limit-timeouts-errors)
- [Omnisend API Events](https://api.omnisend.com/reference/events)
- [Omnisend API Contacts](https://api.omnisend.com/reference/contacts)

## Open Source

The **Omnisend Tag for GTM Server Side** is developed and maintained by the [Stape Team](https://stape.io/) under the Apache 2.0 license.

### GTM Gallery Status
🟢 [Listed](https://tagmanager.google.com/gallery/#/owners/stape-io/templates/omnisend-tag)
