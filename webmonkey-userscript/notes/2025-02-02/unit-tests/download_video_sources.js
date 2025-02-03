// ==========
// JS console
//
// https://7plus.com.au/
// ==========

(function() {

  var unsafeWindow = window

  // ----------------------------------------------------------------------------- state

  var state = {
    account_id: '5303576322001',
    policy_key: 'BCpkADawqM33sxTxTSkUGuTlYrSr1IWKvoedldJ6w01PbfYMPMDR2OSumoyEdKusPv2UC6g_bidqbcAkLzVwSOgD1Yea5O3V0Wu35n2lWGq1FmNDHB4dhwcTqJ7Z3GNoI-mfkmi6xMpLPBAN'
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

  var download_text = function(url, headers, data, callback) {
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
        if (xhr.status === 200) {
          callback(xhr.responseText)
        }
      }
    }

    if (data)
      xhr.send(data)
    else
      xhr.send()
  }

  var download_json = function(url, headers, data, callback) {
    if (!headers)
      headers = {}
    if (!headers.accept)
      headers.accept = 'application/json'

    download_text(url, headers, data, function(text){
      try {
        callback(JSON.parse(text))
      }
      catch(e) {}
    })
  }

  // -----------------------------------------------------------------------------

  var download_video_sources = function(reference_id, callback) {
    download_json(
      /* url= */ 'https://edge.api.brightcove.com/playback/v1/accounts/' + state.account_id + '/videos/ref:' + reference_id,
      /* headers= */ {
        "BCOV-POLICY": state.policy_key
      },
      /* data= */ null,
      function($brightcove_data) {
        if (!$brightcove_data || (typeof $brightcove_data !== 'object') || !Array.isArray($brightcove_data.sources) || !$brightcove_data.sources.length) return

        $brightcove_data.sources = $brightcove_data.sources.filter(function(vidsrc) {
          return vidsrc && (typeof vidsrc === 'object') && vidsrc.src && vidsrc.type
        })
        if (!$brightcove_data.sources.length) return

        var caption_url

        if (Array.isArray($brightcove_data.text_tracks) && $brightcove_data.text_tracks.length) {
          $brightcove_data.text_tracks = $brightcove_data.text_tracks.filter(function(txtrack) {
            return txtrack && (typeof txtrack === 'object') && txtrack.src && (txtrack.kind === 'captions') && (txtrack.mime_type === 'text/webvtt')
          })

          if ($brightcove_data.text_tracks.length) {
            caption_url = $brightcove_data.text_tracks[0].src
          }
        }

        var video_sources = []
        var drm_schemes = ['widevine', 'clearkey', 'playready', 'fairplay']
        var src, video_data, has_drm, drm_keys, drm_key, drm_data, drm_scheme

        for (var i=0; i < $brightcove_data.sources.length; i++) {
          src = $brightcove_data.sources[i]

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
    )
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

  // -----------------------------------------------------------------------------

  download_video_sources('GILG01-001', function(video_sources) {
    console.log(
      JSON.stringify(video_sources, null, 2)
    )
  })
})()

// =======
// output:
// =======

/*

[
  {
    "video_url": "https://manifest.prod.boltdns.net/manifest/v1/dash/live-baseurl/bccenc/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2s/manifest.mpd?fastly_token=NjdhMDJlNzJfZmE5OTUzMGMyMDkzZGRhYmY2YTQ1MTlmNmFhNGE4NmVjZmYyZTliZjI3NzNlYmMyYWYxZjRlNGM0OWMyODNmYw%3D%3D",
    "video_type": "application/dash+xml",
    "caption_url": "https://7plus-sevennetwork.akamaized.net/media/v1/text/vtt/clear/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2f72f4cc-8b79-4395-9074-a80f61f011ec/text.vtt?akamai_token=exp=1738550898~acl=/media/v1/text/vtt/clear/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2f72f4cc-8b79-4395-9074-a80f61f011ec/text.vtt*~hmac=f245940614f8b12451b188c0782c6c8bcbc7c873eb08a2497c78f738fb139d20",
    "referer_url": null,
    "drm": {
      "scheme": "playready",
      "server": "https://manifest.prod.boltdns.net/license/v1/cenc/playready/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/fa554180-ed96-4295-86eb-7ef530274bd3?fastly_token=NjdhMDJlNzJfZTE5Mzk2ZGNkOTJiMmUyZjNhMmM4NzgwNWM2YTYxZWIwMWZhZTA3Zjc4NDRiMWIxMjk5MjA2OGFjZWFjYmQzYg%3D%3D",
      "headers": null
    }
  },
  {
    "video_url": "https://manifest.prod.boltdns.net/manifest/v1/dash/live-baseurl/bccenc/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2s/manifest.mpd?fastly_token=NjdhMDJlNzJfZmE5OTUzMGMyMDkzZGRhYmY2YTQ1MTlmNmFhNGE4NmVjZmYyZTliZjI3NzNlYmMyYWYxZjRlNGM0OWMyODNmYw%3D%3D",
    "video_type": "application/dash+xml",
    "caption_url": "https://7plus-sevennetwork.akamaized.net/media/v1/text/vtt/clear/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2f72f4cc-8b79-4395-9074-a80f61f011ec/text.vtt?akamai_token=exp=1738550898~acl=/media/v1/text/vtt/clear/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2f72f4cc-8b79-4395-9074-a80f61f011ec/text.vtt*~hmac=f245940614f8b12451b188c0782c6c8bcbc7c873eb08a2497c78f738fb139d20",
    "referer_url": null,
    "drm": {
      "scheme": "widevine",
      "server": "https://manifest.prod.boltdns.net/license/v1/cenc/widevine/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/fa554180-ed96-4295-86eb-7ef530274bd3?fastly_token=NjdhMDJlNzJfZDM5ZGQ4ZDA4MTZkNGY5NTY5ODhhOWZmYzdkZmY4ZTcxNjExOGI0ZTcyMWZiN2RmZDM2ODgxNzg4MzE4NzBmZA%3D%3D",
      "headers": null
    }
  },
  {
    "video_url": "https://manifest.prod.boltdns.net/manifest/v2/dash/live-baseurl/bccenc/avc1_mp4a/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2s/manifest.mpd?fastly_token=NjdhMDJlNzJfMGExOWI1ZWRiNmE5MzAwZmU4NzYyYzVlZDYwNmU2M2NlZWNjZGNlM2FkOTg2NzA3ZDU0ZTEzMDAwY2Y5NjFlYw%3D%3D",
    "video_type": "application/dash+xml",
    "caption_url": "https://7plus-sevennetwork.akamaized.net/media/v1/text/vtt/clear/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2f72f4cc-8b79-4395-9074-a80f61f011ec/text.vtt?akamai_token=exp=1738550898~acl=/media/v1/text/vtt/clear/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2f72f4cc-8b79-4395-9074-a80f61f011ec/text.vtt*~hmac=f245940614f8b12451b188c0782c6c8bcbc7c873eb08a2497c78f738fb139d20",
    "referer_url": null,
    "drm": {
      "scheme": "playready",
      "server": "https://manifest.prod.boltdns.net/license/v1/cenc/playready/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/fa554180-ed96-4295-86eb-7ef530274bd3?fastly_token=NjdhMDJlNzJfZTE5Mzk2ZGNkOTJiMmUyZjNhMmM4NzgwNWM2YTYxZWIwMWZhZTA3Zjc4NDRiMWIxMjk5MjA2OGFjZWFjYmQzYg%3D%3D",
      "headers": null
    }
  },
  {
    "video_url": "https://manifest.prod.boltdns.net/manifest/v2/dash/live-baseurl/bccenc/avc1_mp4a/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2s/manifest.mpd?fastly_token=NjdhMDJlNzJfMGExOWI1ZWRiNmE5MzAwZmU4NzYyYzVlZDYwNmU2M2NlZWNjZGNlM2FkOTg2NzA3ZDU0ZTEzMDAwY2Y5NjFlYw%3D%3D",
    "video_type": "application/dash+xml",
    "caption_url": "https://7plus-sevennetwork.akamaized.net/media/v1/text/vtt/clear/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2f72f4cc-8b79-4395-9074-a80f61f011ec/text.vtt?akamai_token=exp=1738550898~acl=/media/v1/text/vtt/clear/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2f72f4cc-8b79-4395-9074-a80f61f011ec/text.vtt*~hmac=f245940614f8b12451b188c0782c6c8bcbc7c873eb08a2497c78f738fb139d20",
    "referer_url": null,
    "drm": {
      "scheme": "widevine",
      "server": "https://manifest.prod.boltdns.net/license/v1/cenc/widevine/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/fa554180-ed96-4295-86eb-7ef530274bd3?fastly_token=NjdhMDJlNzJfZDM5ZGQ4ZDA4MTZkNGY5NTY5ODhhOWZmYzdkZmY4ZTcxNjExOGI0ZTcyMWZiN2RmZDM2ODgxNzg4MzE4NzBmZA%3D%3D",
      "headers": null
    }
  },
  {
    "video_url": "https://manifest.prod.boltdns.net/manifest/v1/dash/live-hbbtv15/playready/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2s/manifest.mpd?fastly_token=NjdhMDJlNzJfOWQxMWVlOTFhZGZkMjBjZTc4YTVkNjkxZjQ2NGViNjJlYTRhZGNiMTdkZmQzYWVjZTg0YmEyMTE0OGZjNjU5Yg%3D%3D",
    "video_type": "application/dash+xml",
    "caption_url": "https://7plus-sevennetwork.akamaized.net/media/v1/text/vtt/clear/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2f72f4cc-8b79-4395-9074-a80f61f011ec/text.vtt?akamai_token=exp=1738550898~acl=/media/v1/text/vtt/clear/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2f72f4cc-8b79-4395-9074-a80f61f011ec/text.vtt*~hmac=f245940614f8b12451b188c0782c6c8bcbc7c873eb08a2497c78f738fb139d20",
    "referer_url": null,
    "drm": {
      "scheme": "playready",
      "server": "https://manifest.prod.boltdns.net/license/v1/playready/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/70e25330-0aa8-4741-b144-7291fe35084e?fastly_token=NjdhMDJlNzJfOTkxNzFjZjU4Y2NhYWUzYTU4NDYxZjQ1YzJhZmRkMmE3OTY3N2ZjODg2Y2QzOTcwMmZiYjM4MTc5ODkyZDFkOQ%3D%3D",
      "headers": null
    }
  },
  {
    "video_url": "https://manifest.prod.boltdns.net/manifest/v2/dash/live-hbbtv15/playready/avc1_mp4a/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2s/manifest.mpd?fastly_token=NjdhMDJlNzJfOTI4YzFlNzU2OTFlMWYzZmExMmIzNzFmNWVkOWEyOTJmZWM2NjQ0MzhjMjNlOTg3NGZiZDFmOGUzOGRiYzFjZg%3D%3D",
    "video_type": "application/dash+xml",
    "caption_url": "https://7plus-sevennetwork.akamaized.net/media/v1/text/vtt/clear/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2f72f4cc-8b79-4395-9074-a80f61f011ec/text.vtt?akamai_token=exp=1738550898~acl=/media/v1/text/vtt/clear/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/2f72f4cc-8b79-4395-9074-a80f61f011ec/text.vtt*~hmac=f245940614f8b12451b188c0782c6c8bcbc7c873eb08a2497c78f738fb139d20",
    "referer_url": null,
    "drm": {
      "scheme": "playready",
      "server": "https://manifest.prod.boltdns.net/license/v1/playready/5303576322001/f6daf5b4-5034-491c-b404-ddc98aa91195/70e25330-0aa8-4741-b144-7291fe35084e?fastly_token=NjdhMDJlNzJfOTkxNzFjZjU4Y2NhYWUzYTU4NDYxZjQ1YzJhZmRkMmE3OTY3N2ZjODg2Y2QzOTcwMmZiYjM4MTc5ODkyZDFkOQ%3D%3D",
      "headers": null
    }
  }
]

*/
