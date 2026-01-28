const BigQuery = require('BigQuery');
const computeEffectiveTldPlusOne = require('computeEffectiveTldPlusOne');
const encodeUriComponent = require('encodeUriComponent');
const getAllEventData = require('getAllEventData');
const getCookieValues = require('getCookieValues');
const getContainerVersion = require('getContainerVersion');
const getEventData = require('getEventData');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const JSON = require('JSON');
const logToConsole = require('logToConsole');
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
    const castValueByKey = (key, value) => {
      switch (key) {
        case 'sendWelcomeEmail':
          return [1, '1', true, 'true'].indexOf(value) !== -1 ? true : false;
        default:
          return value;
      }
    };
    data.contactPropertiesList.forEach((property) => {
      const value = castValueByKey(property.name, property.value);
      destination[property.name] = value;
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
        statusDate: subscriptionStatus.statusDate || undefined // Not required
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

  sendRequest(data, {
    path: '/contacts',
    bodies: [mappedData]
  });
}

function updateContact(data, eventData, mappedData) {
  let path = '/contacts';
  if (data.updateContactSearchKey === 'contactId') {
    const contactId = getOmnisendContactId(data, eventData);
    path += '/' + enc(contactId);
  } else {
    const email = data.contactEmail;
    path += '?email=' + enc(email);
  }

  Object.delete(mappedData, 'contactID'); // If the user forces it, remove it.

  sendRequest(data, {
    path: path,
    bodies: [mappedData]
  });
}

function generateRequestOptions(data) {
  const actionTypeToRequestMethod = {
    trackEvent: 'POST',
    createContact: 'POST',
    updateContact: 'PATCH'
  };

  return {
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': data.apiKey
    },
    method: actionTypeToRequestMethod[data.actionType]
  };
}

function sendRequest(data, requestData) {
  const requestUrl = 'https://api.omnisend.com/v5' + requestData.path;
  const requestOptions = generateRequestOptions(data);
  const requestBodies = requestData.bodies;

  const eventName =
    data.actionType + (data.actionType === 'trackEvent' ? '|' + requestBodies[0].eventName : '');

  const requests = requestBodies.map((requestBody) => {
    log({
      Name: 'Omnisend',
      Type: 'Request',
      EventName: eventName,
      RequestMethod: requestOptions.method,
      RequestUrl: requestUrl,
      RequestBody: requestBody
    });

    return sendHttpRequest(requestUrl, requestOptions, JSON.stringify(requestBody))
      .then((response) => {
        log({
          Name: 'Omnisend',
          Type: 'Response',
          EventName: eventName,
          ResponseStatusCode: response.statusCode,
          ResponseHeaders: response.headers,
          ResponseBody: response.body
        });

        if (response.statusCode >= 200 && response.statusCode < 300) {
          if (data.actionType === 'createContact') {
            const parsedBody = JSON.parse(response.body || '{}');
            if (parsedBody.contactID) storeContactIdCookie(data, parsedBody.contactID);
          }
          return true;
        }
        return false;
      })
      .catch((error) => {
        log({
          Name: 'Omnisend',
          Type: 'Message',
          EventName: eventName,
          Message: 'API call failed or timed out',
          Reason: JSON.stringify(error)
        });
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
      log({
        Name: 'Omnisend',
        Type: 'Message',
        EventName: eventName,
        Message: 'Something went wrong.',
        Reason: JSON.stringify(result)
      });

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

function isValidValue(value) {
  const valueType = getType(value);
  return valueType !== 'null' && valueType !== 'undefined' && value !== '';
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
  const leapYear = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const nonLeapYear = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const secToMs = (s) => s * 1000;
  const minToMs = (m) => m * secToMs(60);
  const hoursToMs = (h) => h * minToMs(60);
  const daysToMs = (d) => d * hoursToMs(24);
  const padStart = (value, length) => {
    let result = makeString(value);
    while (result.length < length) {
      result = '0' + result;
    }
    return result;
  };

  const fourYearsInMs = daysToMs(365 * 4 + 1);
  let year = 1970 + Math.floor(timestamp / fourYearsInMs) * 4;
  timestamp = timestamp % fourYearsInMs;

  while (true) {
    let isLeapYear = year % 4 === 0;
    let nextTimestamp = timestamp - daysToMs(isLeapYear ? 366 : 365);
    if (nextTimestamp < 0) {
      break;
    }
    timestamp = nextTimestamp;
    year = year + 1;
  }

  const daysByMonth = year % 4 === 0 ? leapYear : nonLeapYear;

  let month = 0;
  for (let i = 0; i < daysByMonth.length; i++) {
    const msInThisMonth = daysToMs(daysByMonth[i]);
    if (timestamp > msInThisMonth) {
      timestamp = timestamp - msInThisMonth;
    } else {
      month = i + 1;
      break;
    }
  }

  const date = Math.ceil(timestamp / daysToMs(1));
  timestamp = timestamp - daysToMs(date - 1);
  const hours = Math.floor(timestamp / hoursToMs(1));
  timestamp = timestamp - hoursToMs(hours);
  const minutes = Math.floor(timestamp / minToMs(1));
  timestamp = timestamp - minToMs(minutes);
  const sec = Math.floor(timestamp / secToMs(1));
  timestamp = timestamp - secToMs(sec);
  const milliSeconds = timestamp;

  return (
    year +
    '-' +
    padStart(month, 2) +
    '-' +
    padStart(date, 2) +
    'T' +
    padStart(hours, 2) +
    ':' +
    padStart(minutes, 2) +
    ':' +
    padStart(sec, 2) +
    '.' +
    padStart(milliSeconds, 3) +
    'Z'
  );
}

function log(rawDataToLog) {
  const logDestinationsHandlers = {};
  if (determinateIsLoggingEnabled()) logDestinationsHandlers.console = logConsole;
  if (determinateIsLoggingEnabledForBigQuery()) logDestinationsHandlers.bigQuery = logToBigQuery;

  rawDataToLog.TraceId = getRequestHeader('trace-id');

  const keyMappings = {
    // No transformation for Console is needed.
    bigQuery: {
      Name: 'tag_name',
      Type: 'type',
      TraceId: 'trace_id',
      EventName: 'event_name',
      RequestMethod: 'request_method',
      RequestUrl: 'request_url',
      RequestBody: 'request_body',
      ResponseStatusCode: 'response_status_code',
      ResponseHeaders: 'response_headers',
      ResponseBody: 'response_body'
    }
  };

  for (const logDestination in logDestinationsHandlers) {
    const handler = logDestinationsHandlers[logDestination];
    if (!handler) continue;

    const mapping = keyMappings[logDestination];
    const dataToLog = mapping ? {} : rawDataToLog;

    if (mapping) {
      for (const key in rawDataToLog) {
        const mappedKey = mapping[key] || key;
        dataToLog[mappedKey] = rawDataToLog[key];
      }
    }

    handler(dataToLog);
  }
}

function logConsole(dataToLog) {
  logToConsole(JSON.stringify(dataToLog));
}

function logToBigQuery(dataToLog) {
  const connectionInfo = {
    projectId: data.logBigQueryProjectId,
    datasetId: data.logBigQueryDatasetId,
    tableId: data.logBigQueryTableId
  };

  dataToLog.timestamp = getTimestampMillis();

  ['request_body', 'response_headers', 'response_body'].forEach((p) => {
    dataToLog[p] = JSON.stringify(dataToLog[p]);
  });

  BigQuery.insert(connectionInfo, [dataToLog], { ignoreUnknownValues: true });
}

function determinateIsLoggingEnabled() {
  const containerVersion = getContainerVersion();
  const isDebug = !!(
    containerVersion &&
    (containerVersion.debugMode || containerVersion.previewMode)
  );

  if (!data.logType) {
    return isDebug;
  }

  if (data.logType === 'no') {
    return false;
  }

  if (data.logType === 'debug') {
    return isDebug;
  }

  return data.logType === 'always';
}

function determinateIsLoggingEnabledForBigQuery() {
  if (data.bigQueryLogType === 'no') return false;
  return data.bigQueryLogType === 'always';
}
