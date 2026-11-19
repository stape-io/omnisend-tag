const computeEffectiveTldPlusOne = require('computeEffectiveTldPlusOne');
const encodeUriComponent = require('encodeUriComponent');
const getAllEventData = require('getAllEventData');
const getCookieValues = require('getCookieValues');
const getEventData = require('getEventData');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const JSON = require('JSON');
const makeInteger = require('makeInteger');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const Math = require('Math');
const Object = require('Object');
const parseUrl = require('parseUrl');
const Promise = require('Promise');
const sendHttpRequest = require('sendHttpRequest');
const setCookie = require('setCookie');

/*==============================================================================
==============================================================================*/

const API_BASE_URL = 'https://api.omnisend.com/api';
const API_VERSION = '2026-03-15';

const eventData = getAllEventData();

if (shouldExitEarly(data, eventData)) return;

const actionHandlers = {
  trackEvent: (data, eventData, mappedData) => trackEvent(data, eventData, mappedData),
  createContact: (data, eventData, mappedData) => createContact(data, mappedData),
  updateContact: (data, eventData, mappedData) => updateContact(data, eventData, mappedData)
};

const handler = actionHandlers[data.actionType];
if (handler) {
  const mappedData = {};

  // Common properties
  addContactProperties(data, mappedData);
  addContactIdentifiers(data, eventData, mappedData);

  handler(data, eventData, mappedData);
} else {
  return data.gtmOnFailure();
}

if (data.useOptimisticScenario) {
  return data.gtmOnSuccess();
}

/*==============================================================================
  Vendor related functions
==============================================================================*/

function getContactTags(data) {
  if (!data.contactTags) return;

  let contactTags = [];
  data.contactTags.forEach((d) => {
    if (!d.value) return;
    const tag = makeString(d.value)
      .split(',')
      .map((t) => t.trim());
    contactTags = contactTags.concat(tag);
  });

  return contactTags;
}

function getOmnisendContactId(data, eventData) {
  if (data.actionType === 'createContact') return;

  if (data.contactId) return makeString(data.contactId);

  if (data.useFallbackContactId) {
    const url = eventData.page_location || eventData.page_referrer || getRequestHeader('referer');
    const contactIdFromURL = url ? (parseUrl(url) || {}).searchParams.omnisendContactID : undefined;
    const contactIdFromCookie = getCookieValues('omnisendContactID')[0];
    const contactIdFromEventData = eventData.omnisendContactID;

    return contactIdFromURL || contactIdFromCookie || contactIdFromEventData;
  }
}

function addContactProperties(data, mappedData) {
  let destination = mappedData;
  if (data.actionType === 'trackEvent') {
    mappedData.contact = mappedData.contact || {};
    destination = mappedData.contact;
  }

  if (data.contactPropertiesList) {
    data.contactPropertiesList.forEach((property) => {
      // 'sendWelcomeEmail' is not a contact property anymore. It's mapped to 'identifiers[].sendWelcomeMessage'.
      if (property.name === 'sendWelcomeEmail') return;
      destination[property.name] = property.value;
    });
  }

  const contactTags = getContactTags(data);
  if (contactTags && contactTags.length) destination.tags = contactTags;

  if (data.contactCustomPropertiesList) {
    const customProperties = {};
    data.contactCustomPropertiesList.forEach(
      (property) => (customProperties[property.name] = property.value)
    );
    destination.customProperties = customProperties;
  }

  return mappedData;
}

function getSendWelcomeMessage(data) {
  // The API defaults it to 'true'. It's 'false' unless explicitly enabled, to keep the API v5 behavior.
  let sendWelcomeMessage = false;
  if (!data.contactPropertiesList) return sendWelcomeMessage;

  data.contactPropertiesList.forEach((property) => {
    if (property.name !== 'sendWelcomeEmail') return;
    sendWelcomeMessage = [1, '1', true, 'true'].indexOf(property.value) !== -1;
  });

  return sendWelcomeMessage;
}

function addContactIdentifiers(data, eventData, mappedData) {
  let destination = mappedData;
  if (data.actionType === 'trackEvent') {
    mappedData.contact = mappedData.contact || {};
    destination = mappedData.contact;
  }

  const email = data.contactEmail;
  const emailSubscriptionStatus =
    (data.addEmailSubscriptionStatus &&
      data.emailSubscriptionStatus &&
      data.emailSubscriptionStatus[0]) ||
    {};
  const emailConsent = (data.addEmailConsent && data.emailConsent && data.emailConsent[0]) || {};
  const phone = data.contactPhone;
  const phoneSubscriptionStatus =
    (data.addPhoneSubscriptionStatus &&
      data.phoneSubscriptionStatus &&
      data.phoneSubscriptionStatus[0]) ||
    {};
  const phoneConsent = (data.addPhoneConsent && data.phoneConsent && data.phoneConsent[0]) || {};

  if (data.actionType === 'trackEvent') {
    const processChannel = (channelName, subscriptionStatus, optIns, optOuts, dateStr) => {
      const optData = {
        channel: channelName,
        createdAt: subscriptionStatus.statusDate || dateStr // It's required for 'trackEvent'
      };

      if (subscriptionStatus.status === 'subscribed') {
        optIns.push(optData);
      } else if (subscriptionStatus.status === 'unsubscribed') {
        optOuts.push(optData);
      }
      // 'nonSubscribed' is the absence of a subscription status
    };
    const processConsent = (consent, channelName, consents, dateStr) => {
      if (objHasProps(consent)) {
        for (const key in consent) {
          const value = consent[key];
          if (!value) Object.delete(consent, key); // The API doesn't accept falsy values
        }
        // If the object doesn't have properties, the API considers it as 'Consent Exists' and it uses the current timestamp.
        consent.channel = channelName;
        if (!consent.createdAt) consent.createdAt = dateStr; // It's required for 'trackEvent'
        consents.push(consent);
      }
    };

    const contactId = getOmnisendContactId(data, eventData);
    if (contactId) destination.id = contactId;

    const consents = [];
    const optIns = [];
    const optOuts = [];
    const dateStr = convertTimestampToISO(getTimestampMillis());

    [
      {
        type: 'email',
        value: email,
        channelName: 'email',
        subscriptionStatus: emailSubscriptionStatus,
        consent: emailConsent
      },
      {
        type: 'phone',
        value: phone,
        channelName: 'sms',
        subscriptionStatus: phoneSubscriptionStatus,
        consent: phoneConsent
      }
    ].forEach((identifier) => {
      if (!identifier.value) return;
      destination[identifier.type] = identifier.value;
      processChannel(
        identifier.channelName,
        identifier.subscriptionStatus,
        optIns,
        optOuts,
        dateStr
      );
      processConsent(identifier.consent, identifier.channelName, consents, dateStr);
    });

    if (consents.length) destination.consents = consents;
    if (optIns.length) destination.optIns = optIns;
    if (optOuts.length) destination.optOuts = optOuts;
  } else {
    const processChannel = (channelName, subscriptionStatus) => {
      const channel = {};
      channel[channelName] = {
        status: subscriptionStatus.status ? subscriptionStatus.status : 'nonSubscribed',
        statusChangedAt: subscriptionStatus.statusDate || undefined // Not required
      };
      return channel;
    };
    const processConsent = (consent) => {
      if (objHasProps(consent)) {
        for (const key in consent) {
          const value = consent[key];
          if (!value) Object.delete(consent, key);
        }
        return consent;
      }
    };

    const identifiers = [];
    const sendWelcomeMessage = getSendWelcomeMessage(data);

    [
      {
        type: 'email',
        value: email,
        channelName: 'email',
        subscriptionStatus: emailSubscriptionStatus,
        consent: emailConsent
      },
      {
        type: 'phone',
        value: phone,
        channelName: 'sms',
        subscriptionStatus: phoneSubscriptionStatus,
        consent: phoneConsent
      }
    ].forEach((identifier) => {
      if (!identifier.value) return;

      // Should not add email data if subscription status and consent are not provided
      if (
        data.actionType === 'updateContact' &&
        identifier.type === 'email' &&
        !objHasProps(identifier.subscriptionStatus) &&
        !objHasProps(identifier.consent)
      ) {
        return;
      }

      const identifierData = {
        id: identifier.value,
        type: identifier.type
      };
      identifierData.channels = processChannel(
        identifier.channelName,
        identifier.subscriptionStatus
      );
      const consent = processConsent(identifier.consent);
      // If the object doesn't have properties, the API considers it as 'Consent Exists' and it uses the current timestamp.
      if (consent) identifierData.consent = consent;
      identifierData.sendWelcomeMessage = sendWelcomeMessage;
      identifiers.push(identifierData);
    });

    if (identifiers.length) destination.identifiers = identifiers;
  }

  return mappedData;
}

function mapEventName(data, eventData) {
  if (data.eventType === 'inherit') {
    const eventName = eventData.event_name;
    const gaToEventName = {
      view_item: 'viewed product',
      add_to_cart: 'added product to cart',
      begin_checkout: 'started checkout',
      purchase: 'placed order',
      refund: 'order refunded'
    };

    return gaToEventName[eventName] || eventName;
  }

  return data.eventType === 'standard' ? data.eventNameStandard : data.eventNameCustom;
}

function mapEventVersion(eventName) {
  const eventNameToVersion = {
    'viewed product': 'v4',
    'added product to cart': '',
    'started checkout': 'v2',
    'placed order': 'v2',
    'paid for order': 'v2',
    'ordered product': 'v2',
    'order refunded': 'v2',
    'order fulfilled': 'v2',
    'order canceled': 'v2'
  };

  return eventNameToVersion[eventName] || '';
}

function trackEvent(data, eventData, mappedData) {
  mappedData.eventName = mapEventName(data, eventData);
  mappedData.eventVersion = mapEventVersion(mappedData.eventName);
  mappedData.origin = 'stape-s2s-tag';
  mappedData.properties = {};

  if (data.eventId) mappedData.eventID = data.eventId;
  if (data.eventTimestamp) mappedData.eventTime = data.eventTimestamp;
  if (data.eventVersion) mappedData.eventVersion = data.eventVersion;

  if (data.autoMapEventProperties) {
    const url = eventData.page_location;
    const urlSearchParams = (parseUrl(url) || {}).searchParams || {};
    mappedData.properties.page = {
      url: url,
      title: eventData.page_title
    };
    mappedData.properties.utm = {
      source: eventData.utm_source || urlSearchParams.utm_source,
      campaign: eventData.utm_campaign || urlSearchParams.utm_campaign,
      medium: eventData.utm_medium || urlSearchParams.utm_medium
    };

    let currencyFromItems;
    let valueFromItems;
    let items = eventData.items;
    if (getType(items) === 'string') items = JSON.parse(items);
    if (getType(items) === 'array' && items.length > 0) {
      currencyFromItems = items[0].currency;

      if (mappedData.eventName === 'viewed product') {
        mappedData.properties.product = {};
        if (items[0].item_id) mappedData.properties.product.id = makeString(items[0].item_id);
        if (items[0].item_name)
          mappedData.properties.product.title = makeString(items[0].item_name);
        if (isValidValue(items[0].price))
          mappedData.properties.product.price = makeNumber(items[0].price);
        if (currencyFromItems || eventData.currency)
          mappedData.properties.product.currency = currencyFromItems || eventData.currency;
      } else {
        let itemsArrayName = 'lineItems';
        if (mappedData.eventName === 'order refunded') itemsArrayName = 'refundedLineItems';
        // Not standard. By default, 'addedItem' is an object, but we will use an array, changing to an object later.
        else if (mappedData.eventName === 'added product to cart') itemsArrayName = 'addedItem';

        valueFromItems = 0;
        mappedData.properties[itemsArrayName] = [];
        items.forEach((i) => {
          const item = {};
          if (i.item_id) item.productID = makeString(i.item_id);
          if (i.item_name) item.productTitle = makeString(i.item_name);
          if (isValidValue(i.discount)) item.productDiscount = makeNumber(i.discount);
          if (isValidValue(i.quantity)) item.productQuantity = makeInteger(i.quantity);
          if (isValidValue(i.price)) {
            item.productPrice = makeNumber(i.price);
            if (isValidValue(item.productPrice)) {
              valueFromItems += (item.productQuantity || 1) * item.productPrice;
            }
          }
          mappedData.properties[itemsArrayName].push(item);
        });
      }
    }

    const currency = eventData.currency || currencyFromItems;
    if (currency) mappedData.properties.currency = makeString(currency);

    let valuePropertyName = 'value';
    if (mappedData.eventName === 'placed order') valuePropertyName = 'totalPrice';
    else if (mappedData.eventName === 'order refunded') valuePropertyName = 'totalRefundedAmount';

    if (isValidValue(eventData.value))
      mappedData.properties[valuePropertyName] = makeNumber(eventData.value);
    else if (isValidValue(valueFromItems))
      mappedData.properties[valuePropertyName] = roundValue(valueFromItems);

    if (isValidValue(eventData.tax)) mappedData.properties.totalTax = makeNumber(eventData.tax);
    if (isValidValue(eventData.shipping)) {
      mappedData.properties.shippingPrice = makeNumber(eventData.shipping);
    }

    if (eventData.transaction_id) {
      const transactionId = makeString(eventData.transaction_id);
      mappedData.properties.orderID = transactionId;
      mappedData.properties.orderNumber = transactionId;
    }

    if (eventData.shipping_tier) {
      mappedData.properties.shippingMethod = makeString(eventData.shipping_tier);
    }

    if (eventData.payment_type) {
      mappedData.properties.paymentMethod = makeString(eventData.payment_type);
    }
  }

  if (data.eventPropertiesList) {
    data.eventPropertiesList.forEach(
      (property) => (mappedData.properties[property.name] = property.value)
    );
  }

  if (data.eventCustomPropertiesList) {
    data.eventCustomPropertiesList.forEach(
      (property) => (mappedData.properties[property.name] = property.value)
    );
  }

  // 'added product to cart' event requires a request for each item added to the cart.
  if (
    mappedData.eventName === 'added product to cart' &&
    getType(mappedData.properties.addedItem) === 'array' &&
    mappedData.properties.addedItem.length > 0
  ) {
    mappedData = mappedData.properties.addedItem.map((item) => {
      const mappedDataCopy = JSON.parse(JSON.stringify(mappedData));
      const itemQuantity = makeInteger(item.productQuantity) || 1;
      const itemPrice = makeNumber(item.productPrice) || 0;
      mappedDataCopy.value = itemQuantity * itemPrice;
      mappedDataCopy.properties.addedItem = item;
      return mappedDataCopy;
    });
  }

  sendRequest(data, {
    path: '/events',
    bodies: getType(mappedData) === 'object' ? [mappedData] : mappedData
  });
}

function storeContactIdCookie(data, contactId) {
  if (!data.storeCreatedContactId) return;

  const cookieOptions = {
    domain: getCookieDomain(data.contactIdCookieDomain),
    samesite: data.contactIdCookieSameSite || 'none',
    path: '/',
    secure: true,
    httpOnly: false,
    'max-age': 60 * 60 * 24 * 365
  };

  setCookie('omnisendContactID', contactId, cookieOptions, false);
}

function createContact(data, mappedData) {
  Object.delete(mappedData, 'contactID'); // If the user forces it, remove it.

  sendContactRequest(data, '/contacts', mappedData);
}

function updateContact(data, eventData, mappedData) {
  let path = '/contacts';
  let contactId;
  if (data.updateContactSearchKey === 'contactId') {
    contactId = getOmnisendContactId(data, eventData);
    path += '/' + enc(contactId);
  } else {
    const email = data.contactEmail;
    path += '?email=' + enc(email);
  }

  Object.delete(mappedData, 'contactID'); // If the user forces it, remove it.

  sendContactRequest(data, path, mappedData, contactId);
}

// On Create/Update Contact, the 'tags' field replaces all the existing tags of the contact.
// When appending (default), the tags are sent to the Batch add tags endpoint after the contact request.
function sendContactRequest(data, path, mappedData, fallbackContactId) {
  let tagsToAdd;
  if (data.contactTagsMode !== 'replace' && mappedData.tags) {
    tagsToAdd = mappedData.tags;
    Object.delete(mappedData, 'tags');
  }

  sendRequest(data, {
    path: path,
    bodies: [mappedData],
    onSuccess: (response) => {
      const responseBody = safeJsonParse(response.body) || {};
      const contactId = responseBody.id || responseBody.contactID || fallbackContactId;

      if (data.actionType === 'createContact' && contactId) {
        storeContactIdCookie(data, contactId);
      }

      if (tagsToAdd) return addContactTags(data, contactId, tagsToAdd);
      return true;
    }
  });
}

function addContactTags(data, contactId, tags) {
  const requestBody = { tags: tags };
  if (contactId) requestBody.contactIDs = [makeString(contactId)];
  else if (data.contactEmail) requestBody.emails = [data.contactEmail];
  else if (data.contactPhone) requestBody.phones = [data.contactPhone];
  else return false;

  return sendHttpRequest(
    API_BASE_URL + '/contacts/tags',
    generateRequestOptions(data, 'POST'),
    JSON.stringify(requestBody)
  )
    .then((response) => isSuccessStatusCode(response.statusCode))
    .catch((error) => false);
}

function generateRequestOptions(data, method) {
  const actionTypeToRequestMethod = {
    trackEvent: 'POST',
    createContact: 'POST',
    updateContact: 'PATCH'
  };

  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Omnisend-API-Key ' + data.apiKey,
      'Omnisend-Version': API_VERSION
    },
    method: method || actionTypeToRequestMethod[data.actionType]
  };
}

function sendRequest(data, requestData) {
  const requestUrl = API_BASE_URL + requestData.path;
  const requestOptions = generateRequestOptions(data);
  const requestBodies = requestData.bodies;

  const requests = requestBodies.map((requestBody) => {
    return sendHttpRequest(requestUrl, requestOptions, JSON.stringify(requestBody))
      .then((response) => {
        if (!isSuccessStatusCode(response.statusCode)) return false;
        return requestData.onSuccess ? requestData.onSuccess(response) : true;
      })
      .catch((error) => {
        return false;
      });
  });

  Promise.all(requests)
    .then((results) => {
      if (!data.useOptimisticScenario) {
        const someRequestFailed = results.some((success) => !success);
        if (someRequestFailed) return data.gtmOnFailure();
        else return data.gtmOnSuccess();
      }
    })
    .catch((result) => {
      if (!data.useOptimisticScenario) return data.gtmOnFailure();
    });
}

/*==============================================================================
  Helpers
==============================================================================*/

function shouldExitEarly(data, eventData) {
  const url = eventData.page_location || getRequestHeader('referer');

  if (!isConsentGivenOrNotRequired(data, eventData)) {
    data.gtmOnSuccess();
    return true;
  }

  if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) {
    data.gtmOnSuccess();
    return true;
  }
}

function isSuccessStatusCode(statusCode) {
  return statusCode >= 200 && statusCode < 300;
}

function safeJsonParse(value) {
  if (getType(value) !== 'string') return;
  const trimmed = value.trim();
  const first = trimmed.charAt(0);
  const last = trimmed.charAt(trimmed.length - 1);
  if ((first === '{' && last === '}') || (first === '[' && last === ']')) {
    return JSON.parse(trimmed);
  }
}

function isValidValue(value) {
  const valueType = getType(value);
  if (valueType === 'null' || valueType === 'undefined' || value !== value) return false;
  return value !== '' && value !== 'undefined' && value !== 'null';
}

function getCookieDomain(defaultCookieDomain) {
  return !defaultCookieDomain || defaultCookieDomain === 'auto'
    ? computeEffectiveTldPlusOne(getEventData('page_location') || getRequestHeader('referer')) ||
        'auto'
    : defaultCookieDomain;
}

function roundValue(value) {
  if (!value) return value;
  return Math.round(makeNumber(value) * 100) / 100;
}

function enc(data) {
  if (['null', 'undefined'].indexOf(getType(data)) !== -1) data = '';
  return encodeUriComponent(makeString(data));
}

function objHasProps(obj) {
  return getType(obj) === 'object' && Object.keys(obj).length > 0;
}

function isConsentGivenOrNotRequired(data, eventData) {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}

function convertTimestampToISO(timestamp) {
  const msPerDay = 86400000;
  const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const pad = (value, length) => {
    let result = makeString(value);
    while (result.length < length) result = '0' + result;
    return result;
  };

  let days = Math.floor(timestamp / msPerDay);
  let msOfDay = timestamp - days * msPerDay;

  let year = 1970;
  while (days >= (isLeapYear(year) ? 366 : 365)) {
    days = days - (isLeapYear(year) ? 366 : 365);
    year++;
  }

  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let month = 0;
  while (days >= daysInMonth[month]) {
    days = days - daysInMonth[month];
    month++;
  }

  const hours = Math.floor(msOfDay / 3600000);
  msOfDay = msOfDay - hours * 3600000;
  const minutes = Math.floor(msOfDay / 60000);
  msOfDay = msOfDay - minutes * 60000;
  const seconds = Math.floor(msOfDay / 1000);
  const milliseconds = msOfDay - seconds * 1000;

  return (
    year +
    '-' +
    pad(month + 1, 2) +
    '-' +
    pad(days + 1, 2) +
    'T' +
    pad(hours, 2) +
    ':' +
    pad(minutes, 2) +
    ':' +
    pad(seconds, 2) +
    '.' +
    pad(milliseconds, 3) +
    'Z'
  );
}
