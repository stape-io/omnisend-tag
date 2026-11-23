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
*   **Duplicates**: If the Email (or, when it's the only identifier, the Phone) already belongs to a contact, that contact is updated instead of a new one being created. Identifiers already assigned to another contact are not added to the new contact.
*   **Options**: Can store the created Contact ID in a cookie for future use.

### Update Contact
Updates an existing contact found via **Omnisend Contact ID** or **Email**.
*   **Search Key**: Choose ID to allow email updates, or Email (ID remains unchanged).
*   **Properties**: Only provide the specific fields you want to update.

> **Contact Tags**: On **Create Contact** and **Update Contact**, the **Tags Behavior** option controls how tags are applied:
> *   **Add to the existing tags** (default): the tags are sent in a second request to the [Batch add tags](https://api-docs.omnisend.com/reference/post_contacts-tags) endpoint, which is limited to **60 requests per minute**.
> *   **Replace all the existing tags**: the tags are sent in the contact request and replace all existing tags of the contact.
>
> On **Track Event**, tags are always added to the existing ones.

> **Send Welcome Message**: When set, it's applied to each identifier (Email/Phone) sent on Create/Update Contact. If not set, it's sent as `false`, so no welcome message is sent (the Omnisend API would otherwise default it to `true`).

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
