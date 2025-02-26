// ==UserScript==
// @name         7plus
// @description  Improve site usability. Watch videos in external player.
// @version      2.0.2
// @match        *://*.7plus.com.au/*
// @icon         https://7plus.com.au/favicon.ico
// @run-at       document-end
// @grant        unsafeWindow
// @homepage     https://github.com/warren-bank/crx-7plus/tree/webmonkey-userscript/es5
// @supportURL   https://github.com/warren-bank/crx-7plus/issues
// @downloadURL  https://github.com/warren-bank/crx-7plus/raw/webmonkey-userscript/es5/webmonkey-userscript/7plus.user.js
// @updateURL    https://github.com/warren-bank/crx-7plus/raw/webmonkey-userscript/es5/webmonkey-userscript/7plus.user.js
// @namespace    warren-bank
// @author       Warren Bank
// @copyright    Warren Bank
// ==/UserScript==

// ----------------------------------------------------------------------------- user options

var user_options = {
  "common": {
    "debug_verbosity":              0,  // 0 = silent. 1 = console log. 2 = window alert. 3 = window alert + conditional breakpoint.
    "init_delay_ms":                5000,
    "sort_newest_first":            true
  },
  "webmonkey": {
    "post_intent_redirect_to_url":  null  // "about:blank"
  },
  "greasemonkey": {
    "redirect_to_webcast_reloaded": true,
    "force_http":                   true,
    "force_https":                  false
  }
}

// ----------------------------------------------------------------------------- constants

var constants = {
  "button_attributes": {
    "player_url":                   "x-player-url",

    "reference_id":                 "x-reference-id",
    "video_url":                    "x-video-url",
    "video_type":                   "x-video-type",
    "caption_url":                  "x-caption-url",
    "referer_url":                  "x-referer-url",
    "drm_scheme":                   "x-drm-scheme",
    "drm_server":                   "x-drm-server"
  },
  "img_urls": {
    "base_webcast_reloaded_icons":  "https://github.com/warren-bank/crx-webcast-reloaded/raw/gh-pages/chrome_extension/2-release/popup/img/"
  }
}

var strings = {
  "button_download_video":          "Get Video URL",
  "button_start_video":             "Start Video",
  "episode_labels": {
    "title":                        "title:",
    "summary":                      "summary:",
    "duration":                     "duration:",
    "expires":                      "expires:",
    "video": {
      "format":                     "format:",
      "drm":                        "drm:"
    }
  },
  "livetv_epg_toggle_button": {
    "show":                         "Show",
    "hide":                         "Hide"
  },
  "livetv_channel_labels": {
    "epg": {
      "series_title":               "Series Title:",
      "episode_title":              "Episode Title:",
      "episode_summary":            "Summary:",
      "duration_date_range":        "Time:",
      "duration":                   "Duration:"
    }
  }
}

// ----------------------------------------------------------------------------- state

var state = {
  policy_key: null,
  account_id: null,

  series:     {}, // {title, summary}
  episodes:   [], // [{reference_id, title, summary, duration, expires}]
  current_episode_index: -1,

  id_token: null,
  livetv_channels: [], // [{name, player_url, epg: [{series_title, episode_title, episode_summary, duration_date_range, duration}]}]
  current_livetv_channel_index: -1
}

// ----------------------------------------------------------------------------- CSP

// add support for CSP 'Trusted Type' assignment
var add_default_trusted_type_policy = function() {
  if (typeof unsafeWindow.trustedTypes !== 'undefined') {
    try {
      var passthrough_policy = function(string) {return string}

      unsafeWindow.trustedTypes.createPolicy('default', {
          createHTML:      passthrough_policy,
          createScript:    passthrough_policy,
          createScriptURL: passthrough_policy
      })
    }
    catch(e) {}
  }
}

// ----------------------------------------------------------------------------- debug logger

var debug = function(msg, breakpoint) {
  if (!user_options.common.debug_verbosity) return

  if (msg) {
    if (typeof msg !== 'string')
      msg = JSON.stringify(msg, null, 2)

    switch(user_options.common.debug_verbosity) {
      case 1:
        console.log(msg)
        break
      case 2:
      case 3:
        unsafeWindow.alert(msg)
        break
    }
  }

  if (breakpoint && (user_options.common.debug_verbosity > 2))
    debugger;
}

// ----------------------------------------------------------------------------- helpers (xhr)

var serialize_xhr_body_object = function(data) {
  if (typeof data === 'string')
    return data

  if (!(data instanceof Object))
    return null

  var body = []
  var keys = Object.keys(data)
  var key, val
  for (var i=0; i < keys.length; i++) {
    key = keys[i]
    val = data[key]
    val = unsafeWindow.encodeURIComponent(val)

    body.push(key + '=' + val)
  }
  body = body.join('&')
  return body
}

var download_text = function(url, headers, data, withCredentials, callback) {
  if (data) {
    if (!headers)
      headers = {}
    if (!headers['content-type'])
      headers['content-type'] = 'application/x-www-form-urlencoded'

    switch(headers['content-type'].toLowerCase()) {
      case 'application/json':
        data = JSON.stringify(data)
        break

      case 'application/x-www-form-urlencoded':
      default:
        data = serialize_xhr_body_object(data)
        break
    }
  }

  var xhr    = new unsafeWindow.XMLHttpRequest()
  var method = data ? 'POST' : 'GET'

  xhr.open(method, url, true, null, null)
  xhr.withCredentials = !!withCredentials

  if (headers && (typeof headers === 'object')) {
    var keys = Object.keys(headers)
    var key, val
    for (var i=0; i < keys.length; i++) {
      key = keys[i]
      val = headers[key]
      xhr.setRequestHeader(key, val)
    }
  }

  xhr.onload = function(e) {
    if (xhr.readyState === 4) {
      if ((xhr.status >= 200) && (xhr.status < 300)) {
        callback(null, xhr.responseText)
      }
    }
    callback(new Error())
  }

  xhr.onerror = function(e) {
    callback(new Error())
  }

  if (data)
    xhr.send(data)
  else
    xhr.send()
}

var download_json = function(url, headers, data, withCredentials, callback) {
  if (!headers)
    headers = {}
  if (!headers.accept)
    headers.accept = 'application/json'

  download_text(url, headers, data, withCredentials, function(error, text){
    try {
      if (error)
        callback(error)
      else
        callback(null, JSON.parse(text))
    }
    catch(e) {}
  })
}

// ----------------------------------------------------------------------------- helpers

var make_element = function(elementName, html, text) {
  var el = unsafeWindow.document.createElement(elementName)

  if (html)
    el.innerHTML = html

  if (text)
    el.textContent = text

  return el
}

var make_span = function(text) {return make_element('span', null, text)}
var make_h4   = function(text) {return make_element('h4',   null, text)}

var add_style_element = function(css) {
  if (!css) return

  var head = unsafeWindow.document.getElementsByTagName('head')[0]
  if (!head) return

  if ('function' === (typeof css))
    css = css()
  if (Array.isArray(css))
    css = css.join("\n")

  head.appendChild(
    make_element('style', null, css)
  )
}

var empty_element = function(el, html, text) {
  while (el.childNodes.length)
    el.removeChild(el.childNodes[0])

  if (html)
    el.innerHTML = html

  if (text)
    el.textContent = text

  return el
}

var append_tr = function(tr, td, colspan) {
  if (Array.isArray(td))
    tr.push('<tr><td>' + td.join('</td><td>') + '</td></tr>')
  else if ((typeof colspan === 'number') && (colspan > 1))
    tr.push('<tr><td colspan="' + colspan + '">' + td + '</td></tr>')
  else
    tr.push('<tr><td>' + td + '</td></tr>')
}

var cancel_event = function(event) {
  event.stopPropagation();event.stopImmediatePropagation();event.preventDefault();event.returnValue=false;
}

// https://stackoverflow.com/a/66696162
var convertSecondsToReadableString = function(seconds) {
  seconds = seconds || 0
  seconds = Number(seconds)
  seconds = Math.abs(seconds)

  var d = Math.floor(seconds / (3600 * 24))
  var h = Math.floor(seconds % (3600 * 24) / 3600)
  var m = Math.floor(seconds % 3600 / 60)
  var s = Math.floor(seconds % 60)
  var parts = []

  if (d > 0) {
    parts.push(d + ' day' + (d > 1 ? 's' : ''))
  }
  if (h > 0) {
    parts.push(h + ' hour' + (h > 1 ? 's' : ''))
  }
  if (m > 0) {
    parts.push(m + ' minute' + (m > 1 ? 's' : ''))
  }
  if (s > 0) {
    parts.push(s + ' second' + (s > 1 ? 's' : ''))
  }
  return parts.join(', ')
}

var convertDateRangeToReadableString = function(start_date, end_date) {
  start_date = new Date(start_date)
  end_date   = new Date(end_date)

  var parts = {
    start_date: start_date.toLocaleDateString(),
    start_time: start_date.toLocaleTimeString(),

    end_date:   end_date.toLocaleDateString(),
    end_time:   end_date.toLocaleTimeString()
  }

  var range = parts.start_date + ' ' + parts.start_time + ' - ' + ((parts.end_date !== parts.start_date) ? (parts.end_date + ' ') : '') + parts.end_time
  return range
}

var find_needle = function(data) {
  var index_start, index_stop

  index_start = data.haystack.indexOf(data.needle)
  if (index_start >= 0) {
    index_start += data.needle.length
    index_stop = data.haystack.indexOf(data.tail, index_start)
    if ((index_stop === -1) && !data.strict) {
      index_stop = data.haystack.length
    }
    if (index_stop >= index_start) {
      return data.haystack.substring(index_start, index_stop)
    }
  }
  return null
}

// ----------------------------------------------------------------------------- URL links to tools on Webcast Reloaded website

var get_webcast_reloaded_url = function(video_data, force_http, force_https) {
  force_http  = (typeof force_http  === 'boolean') ? force_http  : user_options.greasemonkey.force_http
  force_https = (typeof force_https === 'boolean') ? force_https : user_options.greasemonkey.force_https

  var encoded_video_url, encoded_caption_url, encoded_referer_url, encoded_drm_url, webcast_reloaded_base, webcast_reloaded_url

  encoded_video_url      = encodeURIComponent(encodeURIComponent(btoa(video_data.video_url)))
  encoded_caption_url    = video_data.caption_url ? encodeURIComponent(encodeURIComponent(btoa(video_data.caption_url))) : null
  video_data.referer_url = video_data.referer_url ? video_data.referer_url : unsafeWindow.location.href
  encoded_referer_url    = encodeURIComponent(encodeURIComponent(btoa(video_data.referer_url)))
  encoded_drm_url        = (video_data.drm.scheme && video_data.drm.server) ? encodeURIComponent(encodeURIComponent(btoa(video_data.drm.scheme + '|' + video_data.drm.server))) : null

  webcast_reloaded_base = {
    "https": "https://warren-bank.github.io/crx-webcast-reloaded/external_website/index.html",
    "http":  "http://webcast-reloaded.frii.site/index.html"
  }

  webcast_reloaded_base = (force_http)
                            ? webcast_reloaded_base.http
                            : (force_https)
                               ? webcast_reloaded_base.https
                               : (video_data.video_url.toLowerCase().indexOf('http:') === 0)
                                  ? webcast_reloaded_base.http
                                  : webcast_reloaded_base.https

  webcast_reloaded_url  = webcast_reloaded_base    + '#/watch/'    + encoded_video_url
                            + (encoded_caption_url ? ('/subtitle/' + encoded_caption_url) : '')
                            + (encoded_referer_url ? ('/referer/'  + encoded_referer_url) : '')
                            + (encoded_drm_url     ? ('/drm/'      + encoded_drm_url) : '')

  return webcast_reloaded_url
}

var get_webcast_reloaded_url_chromecast_sender = function(video_data) {
  return get_webcast_reloaded_url(video_data, /* force_http= */ null, /* force_https= */ null).replace('/index.html', '/chromecast_sender.html')
}

var get_webcast_reloaded_url_airplay_sender = function(video_data) {
  return get_webcast_reloaded_url(video_data, /* force_http= */ true, /* force_https= */ false).replace('/index.html', '/airplay_sender.es5.html')
}

var get_webcast_reloaded_url_proxy = function(video_data) {
  return get_webcast_reloaded_url(video_data, /* force_http= */ true, /* force_https= */ false).replace('/index.html', '/proxy.html')
}

var get_webcast_reloaded_urls = function(video_data) {
  return {
    "index":             get_webcast_reloaded_url(                  video_data),
    "chromecast_sender": get_webcast_reloaded_url_chromecast_sender(video_data),
    "airplay_sender":    get_webcast_reloaded_url_airplay_sender(   video_data),
    "proxy":             get_webcast_reloaded_url_proxy(            video_data)
  }
}

// ----------------------------------------------------------------------------- URL handlers

var redirect_to_url = function(url) {
  if (!url) return

  if (typeof GM_loadUrl === 'function') {
    if (typeof GM_resolveUrl === 'function')
      url = GM_resolveUrl(url, unsafeWindow.location.href) || url

    GM_loadUrl(url, 'Referer', unsafeWindow.location.href)
  }
  else {
    try {
      unsafeWindow.top.location = url
    }
    catch(e) {
      unsafeWindow.window.location = url
    }
  }
}

var process_webmonkey_post_intent_redirect_to_url = function() {
  var url = null

  if (typeof user_options.webmonkey.post_intent_redirect_to_url === 'string')
    url = user_options.webmonkey.post_intent_redirect_to_url

  if (typeof user_options.webmonkey.post_intent_redirect_to_url === 'function')
    url = user_options.webmonkey.post_intent_redirect_to_url()

  if (typeof url === 'string')
    redirect_to_url(url)
}

// -----------------------------------------------------------------------------

var process_video_data = function(data) {
  if (!data.video_url) return

  if (!data.referer_url)
    data.referer_url = unsafeWindow.location.href

  if (typeof GM_startIntent === 'function') {
    // running in Android-WebMonkey: open Intent chooser

    if (!data.video_type)
      data.video_type = ''

    var args = [
      /* action = */ 'android.intent.action.VIEW',
      /* data   = */ data.video_url,
      /* type   = */ data.video_type
    ]

    // extras:
    if (data.caption_url) {
      args.push('textUrl')
      args.push(data.caption_url)
    }
    if (data.referer_url) {
      args.push('referUrl')
      args.push(data.referer_url)
    }
    if (data.drm.scheme) {
      args.push('drmScheme')
      args.push(data.drm.scheme)
    }
    if (data.drm.server) {
      args.push('drmUrl')
      args.push(data.drm.server)
    }
    if (data.drm.headers && (typeof data.drm.headers === 'object')) {
      var drm_header_keys, drm_header_key, drm_header_val

      drm_header_keys = Object.keys(data.drm.headers)
      for (var i=0; i < drm_header_keys.length; i++) {
        drm_header_key = drm_header_keys[i]
        drm_header_val = data.drm.headers[drm_header_key]

        args.push('drmHeader')
        args.push(drm_header_key + ': ' + drm_header_val)
      }
    }

    GM_startIntent.apply(this, args)
    process_webmonkey_post_intent_redirect_to_url()
    return true
  }
  else if (user_options.greasemonkey.redirect_to_webcast_reloaded) {
    // running in standard web browser: redirect URL to top-level tool on Webcast Reloaded website

    redirect_to_url(
      get_webcast_reloaded_url(data)
    )
    return true
  }
  else {
    return false
  }
}

var process_hls_data = function(data) {
  data.video_type = 'application/x-mpegurl'
  process_video_data(data)
}

var process_dash_data = function(data) {
  data.video_type = 'application/dash+xml'
  process_video_data(data)
}

// -----------------------------------------------------------------------------

var process_video_url = function(video_url, video_type, caption_url, referer_url, drm_scheme, drm_server) {
  var data = {
    video_url:   video_url   || null,
    video_type:  video_type  || null,
    caption_url: caption_url || null,
    referer_url: referer_url || null,
    drm: {
      scheme:    drm_scheme,
      server:    drm_server,
      headers:   null
    }
  }

  process_video_data(data)
}

var process_hls_url = function(hls_url, caption_url, referer_url, drm_scheme, drm_server) {
  process_video_url(/* video_url= */ hls_url, /* video_type= */ 'application/x-mpegurl', caption_url, referer_url, drm_scheme, drm_server)
}

var process_dash_url = function(dash_url, caption_url, referer_url, drm_scheme, drm_server) {
  process_video_url(/* video_url= */ dash_url, /* video_type= */ 'application/dash+xml', caption_url, referer_url, drm_scheme, drm_server)
}

// ----------------------------------------------------------------------------- API: download series media items

var download_series_media_items = function(series_id, episode_id, callback) {
  var $brightcove_script_src

  var $inline_scripts = unsafeWindow.document.querySelectorAll('script:not([src])')
  var $inline_script_text
  for (var i=0; i < $inline_scripts.length; i++) {
    $inline_script_text = $inline_scripts[i].textContent.trim()

    if ($inline_script_text.indexOf('window.swm') === 0) {
      // contains: "account_id":"
      // contains: "brightcoveScript":"

      state.account_id = find_needle({
        haystack: $inline_script_text,
        needle:   '"account_id":"',
        tail:     '"',
        strict:   true
      })

      $brightcove_script_src = find_needle({
        haystack: $inline_script_text,
        needle:   '"brightcoveScript":"',
        tail:     '"',
        strict:   true
      })
    }
  }

  debug('account_id: ' + state.account_id)
  if (!state.account_id || !$brightcove_script_src) return

  download_text($brightcove_script_src, null, null, false, function(error, $brightcove_script_text) {
    if (error) return

    // contains: ,policyKey:"

    state.policy_key = find_needle({
      haystack: $brightcove_script_text,
      needle:   ',policyKey:"',
      tail:     '"',
      strict:   true
    })

    debug('policy_key: ' + state.policy_key)
    if (!state.policy_key) return

    download_json(
      /* url= */ 'https://component-cdn.swm.digital/content/' + series_id + '?platform-id=web&market-id=-1&platform-version=1.0.100878&api-version=4.9',
      /* headers= */ null,
      /* data= */ null,
      /* withCredentials= */ false,
      function(error, series_data) {
        if (error) return

        debug('series_data: ' + typeof series_data)
        debug('items: ' + typeof series_data.items + ' (' + (Array.isArray(series_data.items) ? 'array' : 'not array') + ')')
        if (!series_data || (typeof series_data !== 'object') || !Array.isArray(series_data.items) || !series_data.items.length) return

        state.series = {
          title: series_data.title
        }

        if (series_data.pageMetaData && (typeof series_data.pageMetaData === 'object'))
          state.series.summary = series_data.pageMetaData.description

        state.episodes = normalize_series_media_items(
          find_series_media_items(series_data.items)
        )

        debug('episodes: ' + typeof state.episodes + ' (' + ((state.episodes === null) ? 'null' : state.episodes.length) + ')')
        if (!state.episodes || !state.episodes.length) return

        if (user_options.common.sort_newest_first)
          state.episodes.reverse()

        if (episode_id) {
          for (var i=0; i < state.episodes.length; i++) {
            if (state.episodes[i].reference_id === episode_id) {
              state.current_episode_index = i
              break
            }
          }
        }

        callback()
      }
    )
  })
}

var find_series_media_items = function(items) {
  var item, mediaItems

  if (!Array.isArray(items))
    items = [items]

  for (var i=0; i < items.length; i++) {
    item = items[i]
    if (item && (typeof item === 'object')) {
      if (item.mediaItems)
        return item.mediaItems

      if (item.items) {
        mediaItems = find_series_media_items(item.items)

        if (mediaItems)
          return mediaItems
      }
    }
  }

  return null
}

var normalize_series_media_items = function(old_items) {
  if (!Array.isArray(old_items)) return null

  return old_items.map(function(old_item) {
    if (!old_item || (typeof old_item !== 'object')) return null

    var new_item = {}

    if (old_item.playerData && (typeof old_item.playerData === 'object')) {
      new_item.title        = old_item.playerData.title
      new_item.reference_id = old_item.playerData.episodePlayerId
    }

    if (old_item.cardData && (typeof old_item.cardData === 'object')) {
      new_item.summary  = new_item.summary  || old_item.cardData.synopsis
      new_item.duration = new_item.duration || old_item.cardData.duration
      new_item.expires  = new_item.expires  || old_item.cardData.expiresOn
    }

    if (old_item.infoPanelData && (typeof old_item.infoPanelData === 'object')) {
      new_item.summary  = new_item.summary  || old_item.infoPanelData.shortSynopsis
      new_item.duration = new_item.duration || old_item.infoPanelData.duration
      new_item.expires  = new_item.expires  || old_item.infoPanelData.expiresOn
    }

    return new_item
  })
  .filter(function(new_item) {
    return !!(new_item && new_item.title && new_item.reference_id)
  })
}

// ----------------------------------------------------------------------------- API: download video sources for episode in series

var download_episode_video_sources = function(reference_id, callback) {
  download_json(
    /* url= */ 'https://edge.api.brightcove.com/playback/v1/accounts/' + state.account_id + '/videos/ref:' + reference_id,
    /* headers= */ {
      "BCOV-POLICY": state.policy_key
    },
    /* data= */ null,
    /* withCredentials= */ false,
    function(error, api_media_data) {
      if (error) return

      normalize_api_media_data(api_media_data, callback)
    }
  )
}

var normalize_api_media_data = function(api_media_data, callback) {
  if (!api_media_data || (typeof api_media_data !== 'object') || !Array.isArray(api_media_data.sources) || !api_media_data.sources.length) return

  api_media_data.sources = api_media_data.sources.filter(function(vidsrc) {
    return !!(vidsrc && (typeof vidsrc === 'object') && vidsrc.src && vidsrc.type)
  })
  if (!api_media_data.sources.length) return

  var caption_url

  if (Array.isArray(api_media_data.text_tracks) && api_media_data.text_tracks.length) {
    api_media_data.text_tracks = api_media_data.text_tracks.filter(function(txtrack) {
      return !!(txtrack && (typeof txtrack === 'object') && txtrack.src && (txtrack.kind === 'captions') && (txtrack.mime_type === 'text/webvtt'))
    })

    if (api_media_data.text_tracks.length) {
      caption_url = api_media_data.text_tracks[0].src
    }
  }

  var video_sources = []
  var drm_schemes = ['widevine', 'clearkey', 'playready', 'fairplay']
  var src, video_data, has_drm, drm_keys, drm_key, drm_data, drm_scheme

  for (var i=0; i < api_media_data.sources.length; i++) {
    src = api_media_data.sources[i]

    video_data = {
      video_url:   src.src,
      video_type:  src.type,
      caption_url: caption_url,
      referer_url: null,
      drm: {
        scheme:    null,
        server:    null,
        headers:   null
      }
    }

    has_drm = false

    if (src.key_systems && (typeof src.key_systems === 'object')) {
      drm_keys = Object.keys(src.key_systems)

      if (drm_keys.length)
        has_drm = true

      for (var j=0; j < drm_keys.length; j++) {
        drm_key  = drm_keys[j]
        drm_data = src.key_systems[drm_key]

        if (drm_data && (typeof drm_data === 'object') && drm_data.license_url) {
          drm_scheme = resolve_drm_scheme(drm_schemes, drm_key)

          if (drm_scheme) {
            video_sources.push(
              Object.assign({}, video_data, {drm: {
                scheme:  drm_scheme,
                server:  drm_data.license_url,
                headers: null
              }})
            )
          }
        }
      }
    }

    if (!has_drm) {
      video_sources.push(video_data)
    }
  }

  callback(video_sources)
}

var resolve_drm_scheme = function(drm_schemes, drm_key) {
  var drm_scheme

  for (var i=0; i < drm_schemes.length; i++) {
    drm_scheme = drm_schemes[i]

    if (drm_key.indexOf(drm_scheme) >= 0) {
      return drm_scheme
    }
  }

  return null
}

// ----------------------------------------------------------------------------- API: download JWT to access live tv channels

var download_id_token = function(callback) {
  var api_cookie = unsafeWindow.document.cookie.split(';')
    .map(function(pair) {
      pair = pair.trim()
      return (pair.indexOf('glt_') === 0) ? pair : null
    })
    .filter(function(pair) {return !!pair})
    .map(function(pair) {return pair.split('=')})
    .pop()

  if (!api_cookie) return

  var api_key   = api_cookie[0].substring(4, api_cookie[0].length)
  var api_value = api_cookie[1]

  download_json(
    /* url= */ 'https://login.7plus.com.au/accounts.getJWT',
    /* headers= */ null,
    /* data= */ {
      'APIKey':      api_key,
      'sdk':         'js_latest',
      'login_token': api_value,
      'authMode':    'cookie',
      'pageURL':     'https://7plus.com.au/?overlay=sign-in',
      'sdkBuild':    '17058',
      'format':      'json'
    },
    /* withCredentials= */ true,
    function(error, login_resp) {
      if (error) return

      if (login_resp && (typeof login_resp === 'object') && login_resp.id_token) {
        state.id_token = login_resp.id_token
        callback()
      }
      else {
        debug('Failed to obtain JWT. API response: ' + JSON.stringify(login_resp, null, 2))
      }
    }
  )
}

// ----------------------------------------------------------------------------- API: download live tv guide

var download_livetv_guide = function(channelId, callback) {
  download_json(
    /* url= */ 'https://component.swm.digital/v2/component/live-tv?component-id=489700&platform-id=Web&market-id=4&platform-version=1.0.102084&api-version=4.9.0.0&signedUp=False',
    /* headers= */ null,
    /* data= */ null,
    /* withCredentials= */ false,
    function(error, livetv_data) {
      if (error) return

      debug('livetv_data: ' + typeof livetv_data)
      debug('channels: ' + typeof livetv_data.mediaItems + ' (' + (Array.isArray(livetv_data.mediaItems) ? 'array' : 'not array') + ')')
      if (!livetv_data || (typeof livetv_data !== 'object') || !Array.isArray(livetv_data.mediaItems) || !livetv_data.mediaItems.length) return

      state.series = {
        title:   'Live TV Channels',
        summary: null
      }

      state.livetv_channels = normalize_livetv_channels_list(
        livetv_data.mediaItems
      )

      debug('live tv channels: ' + typeof state.livetv_channels + ' (' + ((state.livetv_channels === null) ? 'null' : state.livetv_channels.length) + ')')
      if (!state.livetv_channels || !state.livetv_channels.length) return

      if (channelId) {
        for (var i=0; i < state.livetv_channels.length; i++) {
          if (state.livetv_channels[i].channelId === channelId) {
            state.current_livetv_channel_index = i
            break
          }
        }
      }

      callback()
    }
  )
}

var normalize_livetv_channels_list = function(all_channels) {
  if (!Array.isArray(all_channels) || !all_channels.length) return null

  return all_channels.map(function(channel) {
    if (!channel || (typeof channel !== 'object') || !channel.channelName || !channel.schedules || (typeof channel.schedules !== 'object') || !Array.isArray(channel.schedules.sourceList) || !channel.schedules.sourceList.length) return null

    var i, source, player_url

    for (i=0; i < channel.schedules.sourceList.length; i++) {
      source = channel.schedules.sourceList[i]

      if (source && (typeof source === 'object') && (source.type === 'player') && source.url) {
        player_url = source.url
        break
      }
    }

    if (!player_url) return null

    var epg = (Array.isArray(channel.schedules.items) && channel.schedules.items.length)
      ? channel.schedules.items.map(function(broadcast) {
          var duration_date_range, duration

          duration_date_range = (broadcast.startTime && broadcast.endTime)
            ? convertDateRangeToReadableString(broadcast.startTime, broadcast.endTime)
            : null

          duration = broadcast.duration
            ? convertSecondsToReadableString(
                broadcast.duration * 60
              )
            : null

          return {
            series_title:        broadcast.title,
            episode_title:       broadcast.subTitle,
            episode_summary:     broadcast.synopsis,
            duration_date_range: duration_date_range,
            duration:            duration
          }
        })
      : null

    return {
      channelId:  channel.channelName,
      name:       channel.name || channel.channelName,
      player_url: player_url,
      epg:        epg
    }
  })
  .filter(function(channel) {
    return !!channel
  })
}

// ----------------------------------------------------------------------------- API: download video sources for live tv channel

var download_livetv_channel_video_sources = function(player_url, callback) {
  // request #1 = (player_url) => video_url
  // request #2 = (video_url, id_token) => video_sources

  download_json(
    /* url= */ player_url,
    /* headers= */ null,
    /* data= */ null,
    /* withCredentials= */ false,
    function(error, player_data) {
      if (error) return

      if (!player_data || (typeof player_data !== 'object') || !player_data.videoPlayer || (typeof player_data.videoPlayer !== 'object') || !player_data.videoPlayer.videoUrl) return

      var livetv_channel_url = player_data.videoPlayer.videoUrl
        .replace('{ppId}',       '')
        .replace('{deviceId}',   '00000000-0000-0000-0000-000000000000')
        .replace('{postcode}',   '2000')
        .replace('{advertid}',   'null')
        .replace('{deliveryId}', 'csai')

      download_json(
        /* url= */ livetv_channel_url,
        /* headers= */ {
          'authorization': 'Bearer ' + state.id_token
        },
        /* data= */ null,
        /* withCredentials= */ true,
        function(error, livetv_channel_data) {
          if (error) return

          if (!livetv_channel_data || (typeof livetv_channel_data !== 'object')) return

          normalize_api_media_data(livetv_channel_data.media, callback)
        }
      )
    }
  )
}

// ----------------------------------------------------------------------------- DOM: static skeleton

var reinitialize_dom = function() {
  add_default_trusted_type_policy()

  unsafeWindow.document.close()
  unsafeWindow.document.open()
  unsafeWindow.document.write('')
  unsafeWindow.document.close()

  empty_element(unsafeWindow.document.getElementsByTagName('head')[0])
  empty_element(unsafeWindow.document.body)

  add_style_element(function(){
    return [
      // --------------------------------------------------- reset

      'body {',
      '  margin: 0;',
      '  padding: 0;',
      '  font-family: serif;',
      '  font-size: 16px;',
      '  background-color: #fff !important;',
      '  overflow: auto !important;',
      '}',

      // --------------------------------------------------- series title

      'body > div > h2 {',
      '  display: block;',
      '  margin: 0;',
      '  padding: 0.5em;',
      '  font-size: 22px;',
      '  text-align: center;',
      '  background-color: #ccc;',
      '}',

      // --------------------------------------------------- series description

      'body > div > div {',
      '  padding: 0.5em;',
      '  font-size: 18px;',
      '}',

      // --------------------------------------------------- list of videos: episodes in series, or individual movie or episode

      'body > div > ul {',
      '  list-style: none;',
      '  margin: 0;',
      '  padding: 0;',
      '  padding-left: 1em;',
      '  padding-bottom: 1em;',
      '}',

      'body > div > ul > li {',
      '  list-style: none;',
      '  margin-top: 0.5em;',
      '  border-top: 1px solid #999;',
      '  padding-top: 0.5em;',
      '}',

      'body > div > ul > li > table td:first-child {',
      '  font-style: italic;',
      '  padding-right: 1em;',
      '}',

      'body > div > ul > li > blockquote {',
      '  display: block;',
      '  background-color: #eee;',
      '  padding: 0.5em 1em;',
      '  margin: 0;',
      '}',

      'body > div > ul > li > div {',
      '  margin: 0.75em 0;',
      '}',

      // --------------------------------------------------- drm

      'body > div > ul > li > div > table {',
      '  width: 100%;',
      '  border-collapse: collapse;',
      '}',

      'body > div > ul > li > div > table tr > td:first-child + td {',
      '  width: 100%;',
      '}',

      'body > div > ul > li > div > table tr > td {',
      '  border-top: 1px solid #999;',
      '  padding: 0.5em 0;',
      '}',

      'body > div > ul > li > div > table tr:first-child > td {',
      '  border-top-style: none;',
      '}',

      'body > div > ul > li > div > table button {',
      '  white-space: nowrap;',
      '}',

      'body > div > ul > li > div > table tr > td:last-child > div.icons-container {',
      '}',

      // --------------------------------------------------- links to tools on Webcast Reloaded website

      'body > div > ul > li div.icons-container {',
      '  display: block;',
      '  position: relative;',
      '  z-index: 1;',
      '  float: right;',
      '  margin: 0.5em;',
      '  width: 60px;',
      '  height: 60px;',
      '  max-height: 60px;',
      '  vertical-align: top;',
      '  background-color: #d7ecf5;',
      '  border: 1px solid #000;',
      '  border-radius: 14px;',
      '}',

      'body > div > ul > li div.icons-container > a.chromecast,',
      'body > div > ul > li div.icons-container > a.chromecast > img,',
      'body > div > ul > li div.icons-container > a.airplay,',
      'body > div > ul > li div.icons-container > a.airplay > img,',
      'body > div > ul > li div.icons-container > a.proxy,',
      'body > div > ul > li div.icons-container > a.proxy > img,',
      'body > div > ul > li div.icons-container > a.video-link,',
      'body > div > ul > li div.icons-container > a.video-link > img {',
      '  display: block;',
      '  width: 25px;',
      '  height: 25px;',
      '}',

      'body > div > ul > li div.icons-container > a.chromecast,',
      'body > div > ul > li div.icons-container > a.airplay,',
      'body > div > ul > li div.icons-container > a.proxy,',
      'body > div > ul > li div.icons-container > a.video-link {',
      '  position: absolute;',
      '  z-index: 1;',
      '  text-decoration: none;',
      '}',

      'body > div > ul > li div.icons-container > a.chromecast,',
      'body > div > ul > li div.icons-container > a.airplay {',
      '  top: 0;',
      '}',
      'body > div > ul > li div.icons-container > a.proxy,',
      'body > div > ul > li div.icons-container > a.video-link {',
      '  bottom: 0;',
      '}',

      'body > div > ul > li div.icons-container > a.chromecast,',
      'body > div > ul > li div.icons-container > a.proxy {',
      '  left: 0;',
      '}',
      'body > div > ul > li div.icons-container > a.airplay,',
      'body > div > ul > li div.icons-container > a.video-link {',
      '  right: 0;',
      '}',
      'body > div > ul > li div.icons-container > a.airplay + a.video-link {',
      '  right: 17px; /* (60 - 25)/2 to center when there is no proxy icon */',
      '}',

      // --------------------------------------------------- live tv channel

      'body > div > ul > li > blockquote + div + div > table.livetv-channel tr {',
      '  vertical-align: top;',
      '}',

      'body > div > ul > li > blockquote + div + div > table.livetv-channel tr > td {',
      '  padding: 0;',
      '}',

      'body > div > ul > li > blockquote + div + div > table.livetv-channel tr > td:first-child {',
      '  white-space: nowrap;',
      '  padding-right: 1em;',
      '}',

      'body > div > ul > li > blockquote + div + div > table.livetv-channel tr > td > h3 {',
      '  padding: 0;',
      '  margin: 0;',
      '}',

      'body > div > ul > li > blockquote + div + div > table.livetv-channel table {',
      '  width: 100%;',
      '}',

      'body > div > ul > li > blockquote + div + div > table.livetv-channel table table tr > td {',
      '  border-style: none;',
      '  padding: 0.25em 0;',
      '}',

      'body > div > ul > li > blockquote + div + div > table.livetv-channel div.livetv-epg-toggle-container {',
      '  transition: height  0.5s linear;',
      '  overflow-y: hidden !important;',
      '  height: auto !important;',
      '}',

      'body > div > ul > li > blockquote + div + div > table.livetv-channel div.livetv-epg-toggle-container.toggle-hide {',
      '  height: 0px !important;',
      '}',

      ''
    ]
  })

  var div, ul, li
  var i

  div = make_element('div')
  ul  = make_element('ul')
  div.appendChild(ul)

  if (state.series.title) {
    div.insertBefore(
      make_element('h2', null, state.series.title),
      ul
    )
  }

  if (state.series.summary) {
    div.insertBefore(
      make_element('div', null, state.series.summary),
      ul
    )
  }

  for (i=0; i < state.episodes.length; i++) {
    li = make_episode_listitem_element(
      state.episodes[i]
    )

    if (li) {
      ul.appendChild(li)

      if (i === state.current_episode_index) {
        li.querySelector(':scope button[' + constants.button_attributes.reference_id + ']').click()
      }
    }
  }

  for (i=0; i < state.livetv_channels.length; i++) {
    li = make_livetv_channel_listitem_element(
      state.livetv_channels[i]
    )

    if (li) {
      ul.appendChild(li)

      if (i === state.current_livetv_channel_index) {
        li.querySelector(':scope button[' + constants.button_attributes.player_url + ']').click()
      }
    }
  }

  unsafeWindow.document.body.appendChild(div)
}

// ----------------------------------------------------------------------------- DOM: <li> for episode in show series

var make_episode_listitem_element = function(episode) {
  // const {reference_id, title, summary, duration, expires} = episode

  var tr, html, li, div_dynamic

  tr = []
  if (episode.title)
    append_tr(tr, [strings.episode_labels.title, episode.title])
  if (episode.duration)
    append_tr(tr, [strings.episode_labels.duration, episode.duration])
  if (episode.expires)
    append_tr(tr, [strings.episode_labels.expires, episode.expires])
  if (episode.summary)
    append_tr(tr, strings.episode_labels.summary, 2)

  html = [
    '<table>' + tr.join("\n") + '</table>',
    '<blockquote>' + episode.summary + '</blockquote>',
    '<div></div>'
  ]

  li = make_element('li', html.join("\n"))

  div_dynamic = li.querySelector(':scope > div')
  div_dynamic.appendChild(
    make_download_video_button(episode.reference_id)
  )

  return li
}

var make_download_video_button = function(reference_id) {
  var button = make_element('button')

  button.setAttribute(constants.button_attributes.reference_id, reference_id)
  button.textContent = strings.button_download_video
  button.addEventListener("click", onclick_download_video_button)

  return button
}

var onclick_download_video_button = function(event) {
  cancel_event(event)

  var button, div_dynamic, reference_id

  button = event.target
  if (!button) return

  div_dynamic = button.parentElement
  if (!div_dynamic) return

  reference_id = button.getAttribute(constants.button_attributes.reference_id)
  if (!reference_id) return

  add_video_sources_to_episode_listitem_element(div_dynamic, reference_id)
}

var add_video_sources_to_episode_listitem_element = function(div_dynamic, reference_id) {
  download_episode_video_sources(reference_id, function(video_sources) {
    add_video_sources_to_listitem_element(div_dynamic, video_sources)
  })
}

var add_video_sources_to_listitem_element = function(div_dynamic, video_sources) {
  // video_sources is array of video_data: {video_url, video_type, caption_url, referer_url, drm: {scheme, server, headers}}

  var tr, video_data, video_summary, td_button, td_icons, div_icons, a_icons, a_icon
  var i

  tr = []
  for (i=0; i < video_sources.length; i++) {
    video_data = video_sources[i]

    video_summary  = '<ul>'
    video_summary += '  <li>' + strings.episode_labels.video.format + ' ' + video_data.video_type + '</li>'
    video_summary += '  <li>' + strings.episode_labels.video.drm    + ' ' + (video_data.drm.scheme || 'none') + '</li>'
    video_summary += '</ul>'

    append_tr(tr, ['', video_summary, '']) // col 1: button. col 3: icons.
  }
  empty_element(div_dynamic, '<table>' + tr.join("\n") + '</table>')

  tr = div_dynamic.querySelectorAll(':scope > table tr')

  for (i=0; i < tr.length; i++) {
    video_data = video_sources[i]

    td_button = tr[i].querySelector(':scope > td:first-child')
    td_icons  = tr[i].querySelector(':scope > td:last-child')

    add_start_video_button(/* block_element= */ td_button, video_data)

    if (video_data.drm.scheme) {
      div_icons = make_webcast_reloaded_div(video_data)

      a_icons = {
        real:    {},  // order: chromecast, airplay, [proxy], video-link
        ordered: []
      }

      a_icons.real.airplay    = div_icons.querySelector('a.airplay')
      a_icons.real.direct_hls = div_icons.querySelector('a.video-link')

      a_icon = a_icons.real.direct_hls.cloneNode(/* deep= */ true)
      a_icon.className = 'chromecast'
      a_icons.ordered.push(a_icon)

      a_icon = a_icons.real.direct_hls.cloneNode(/* deep= */ true)
      a_icon.className = 'airplay'
      a_icon.setAttribute('href',  video_data.drm.server)
      a_icon.setAttribute('title', 'direct link to ' + video_data.drm.scheme + ' drm server')
      a_icons.ordered.push(a_icon)

      a_icon = a_icons.real.airplay.cloneNode(/* deep= */ true)
      a_icon.className = 'video-link'
      a_icons.ordered.push(a_icon)

      empty_element(div_icons)

      for (var j=0; j < a_icons.ordered.length; j++) {
        a_icon = a_icons.ordered[j]

        div_icons.appendChild(a_icon)
      }
      a_icons = null

      td_icons.appendChild(div_icons)
    }
    else {
      insert_webcast_reloaded_div(/* block_element= */ td_icons, video_data)
    }
  }
}

var add_start_video_button = function(block_element, video_data) {
  var new_button = make_start_video_button(video_data)

  block_element.appendChild(new_button)
}

var make_start_video_button = function(video_data) {
  var button = make_element('button')

  button.setAttribute(constants.button_attributes.video_url,   video_data.video_url   || '')
  button.setAttribute(constants.button_attributes.video_type,  video_data.video_type  || '')
  button.setAttribute(constants.button_attributes.caption_url, video_data.caption_url || '')
  button.setAttribute(constants.button_attributes.referer_url, video_data.referer_url || '')
  button.setAttribute(constants.button_attributes.drm_scheme,  video_data.drm.scheme  || '')
  button.setAttribute(constants.button_attributes.drm_server,  video_data.drm.server  || '')
  button.textContent = strings.button_start_video
  button.addEventListener("click", onclick_start_video_button)

  return button
}

var onclick_start_video_button = function(event) {
  cancel_event(event)

  var button      = event.target
  var video_url   = button.getAttribute(constants.button_attributes.video_url)
  var video_type  = button.getAttribute(constants.button_attributes.video_type)
  var caption_url = button.getAttribute(constants.button_attributes.caption_url)
  var referer_url = button.getAttribute(constants.button_attributes.referer_url)
  var drm_scheme  = button.getAttribute(constants.button_attributes.drm_scheme)
  var drm_server  = button.getAttribute(constants.button_attributes.drm_server)

  if (video_url)
    process_video_url(video_url, video_type, caption_url, referer_url, drm_scheme, drm_server)
}

// -----------------------------------------------------------------------------

var insert_webcast_reloaded_div = function(block_element, video_data) {
  var webcast_reloaded_div = make_webcast_reloaded_div(video_data)

  block_element.appendChild(webcast_reloaded_div)
}

var make_webcast_reloaded_div = function(video_data) {
  var webcast_reloaded_urls = get_webcast_reloaded_urls(video_data)

  var div = make_element('div')

  var html = [
    '<a target="_blank" class="chromecast" href="' + webcast_reloaded_urls.chromecast_sender   + '" title="Chromecast Sender"><img src="'       + constants.img_urls.base_webcast_reloaded_icons + 'chromecast.png"></a>',
    '<a target="_blank" class="airplay" href="'    + webcast_reloaded_urls.airplay_sender      + '" title="ExoAirPlayer Sender"><img src="'     + constants.img_urls.base_webcast_reloaded_icons + 'airplay.png"></a>',
    '<a target="_blank" class="proxy" href="'      + webcast_reloaded_urls.proxy               + '" title="HLS-Proxy Configuration"><img src="' + constants.img_urls.base_webcast_reloaded_icons + 'proxy.png"></a>',
    '<a target="_blank" class="video-link" href="' + video_data.video_url                      + '" title="direct link to video"><img src="'    + constants.img_urls.base_webcast_reloaded_icons + 'video_link.png"></a>'
  ]

  div.setAttribute('class', 'icons-container')
  div.innerHTML = html.join("\n")

  return div
}

// ----------------------------------------------------------------------------- DOM: <li> for live tv channel

var make_livetv_channel_listitem_element = function(channel) {
  // const {name, player_url, epg} = channel

  var tr, epg_html, html, li, div_dynamic, livetv_epg_toggle_button

  tr = []
  if (Array.isArray(channel.epg) && channel.epg.length) {
    for (var i=0; i < channel.epg.length; i++) {
      append_tr(
        tr,
        add_epg_to_livetv_channel_listitem_element(channel.epg[i])
      )
    }
  }

  epg_html = []
  if (tr.length) {
    epg_html = [
      '<div>',
        '<table class="livetv-channel">',
          '<tr>',
            '<td></td>',
            '<td>',
              '<h3>EPG:</h3>',
              '<button class="livetv-epg-toggle-button">' + strings.livetv_epg_toggle_button.show + '</button>',
              '<div class="livetv-epg-toggle-container toggle-hide">',
                '<table class="livetv-epg">',
                  '<tr><td></td></tr>',
                  tr.join("\n"),
                '</table>',
              '</div>',
            '</td>',
          '</tr>',
        '</table>',
      '</div>'
    ]
  }

  html = [
    '<blockquote>' + channel.name + '</blockquote>',
    '<div></div>',
    epg_html.join("\n")
  ]

  li = make_element('li', html.join("\n"))

  epg_html = null
  html = null

  div_dynamic = li.querySelector(':scope > blockquote + div')
  div_dynamic.appendChild(
    make_download_livetv_channel_button(channel.player_url)
  )

  livetv_epg_toggle_button = li.querySelector(':scope button.livetv-epg-toggle-button')
  if (livetv_epg_toggle_button) {
    livetv_epg_toggle_button.addEventListener("click", onclick_livetv_epg_toggle_button)
  }

  return li
}

var add_epg_to_livetv_channel_listitem_element = function(epg) {
  // const {series_title, episode_title, episode_summary, duration_date_range, duration} = epg

  var tr = []
  if (epg.duration_date_range)
    append_tr(tr, [strings.livetv_channel_labels.epg.duration_date_range, epg.duration_date_range])
  if (epg.duration)
    append_tr(tr, [strings.livetv_channel_labels.epg.duration, epg.duration])
  if (epg.series_title)
    append_tr(tr, [strings.livetv_channel_labels.epg.series_title, epg.series_title])
  if (epg.episode_title)
    append_tr(tr, [strings.livetv_channel_labels.epg.episode_title, epg.episode_title])
  if (epg.episode_summary)
    append_tr(tr, [strings.livetv_channel_labels.epg.episode_summary, epg.episode_summary])

  return '<table>' + tr.join("\n") + '</table>'
}

var onclick_livetv_epg_toggle_button = function(event) {
  cancel_event(event)

  var className = 'toggle-hide'
  var button, div_dynamic

  button = event.target
  if (!button) return

  div_dynamic = button.nextElementSibling
  if (!div_dynamic || !div_dynamic.classList.contains('livetv-epg-toggle-container')) return

  if (div_dynamic.classList.contains(className)) {
    // toggle: hide => show
    div_dynamic.classList.remove(className)
    button.textContent = strings.livetv_epg_toggle_button.hide
  }
  else {
    // toggle: show => hide
    div_dynamic.classList.add(className)
    button.textContent = strings.livetv_epg_toggle_button.show
  }
}

var make_download_livetv_channel_button = function(player_url) {
  var button = make_element('button')

  button.setAttribute(constants.button_attributes.player_url, player_url)
  button.textContent = strings.button_download_video
  button.addEventListener("click", onclick_download_livetv_channel_button)

  return button
}

var onclick_download_livetv_channel_button = function(event) {
  cancel_event(event)

  var button, div_dynamic, player_url

  button = event.target
  if (!button) return

  div_dynamic = button.parentElement
  if (!div_dynamic) return

  player_url = button.getAttribute(constants.button_attributes.player_url)
  if (!player_url) return

  add_video_sources_to_livetv_channel_listitem_element(div_dynamic, player_url)
}

var add_video_sources_to_livetv_channel_listitem_element = function(div_dynamic, player_url) {
  download_livetv_channel_video_sources(player_url, function(video_sources) {
    add_video_sources_to_listitem_element(div_dynamic, video_sources)
  })
}

// ----------------------------------------------------------------------------- bootstrap: live tv

var page_init_livetv = function() {
  var path = unsafeWindow.location.pathname
  var qs   = unsafeWindow.location.search
  var channelId

  if (path.indexOf('/live-tv') === 0) {
    channelId = find_needle({
      haystack: qs,
      needle:   'channel-id=',
      tail:     '&',
      strict:   false
    })
    debug('channelId: ' + channelId)

    download_id_token(function() {
      download_livetv_guide(channelId, reinitialize_dom)
    })

    return true
  }
  return false
}

// ----------------------------------------------------------------------------- bootstrap: shows

var page_init_shows = function() {
  var path = unsafeWindow.location.pathname
  var qs   = unsafeWindow.location.search
  var seriesId, episodeId

  if ((path.length < 2) || (path[0] !== '/')) return false
  seriesId = path.split('/')[1]
  debug('seriesId: ' + seriesId)

  episodeId = find_needle({
    haystack: qs,
    needle:   'episode-id=',
    tail:     '&',
    strict:   false
  })
  debug('episodeId: ' + episodeId)

  download_series_media_items(seriesId, episodeId, reinitialize_dom)
  return true
}

// ----------------------------------------------------------------------------- bootstrap

var page_init = function() {
  debug('initializing..', true)

  page_init_livetv() || page_init_shows()
}

if (user_options.common.init_delay_ms)
  unsafeWindow.setTimeout(page_init, user_options.common.init_delay_ms)
else
  page_init()
