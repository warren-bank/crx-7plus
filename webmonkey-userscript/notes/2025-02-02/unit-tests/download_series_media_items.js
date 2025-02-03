// ==========
// JS console
//
// https://7plus.com.au/gilmore-girls
// ==========

(function() {

  var unsafeWindow = window

  var debug = console.log

  // ----------------------------------------------------------------------------- state

  var state = {}

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

  // ----------------------------------------------------------------------------- API: download series media items

  var download_series_media_items = function(callback) {
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
          tail:     '"'
        })

        $brightcove_script_src = find_needle({
          haystack: $inline_script_text,
          needle:   '"brightcoveScript":"',
          tail:     '"'
        })
      }
    }

    debug('account_id: ' + state.account_id)
    if (!state.account_id || !$brightcove_script_src) return

    download_text($brightcove_script_src, null, null, function($brightcove_script_text) {
      // contains: ,policyKey:"

      state.policy_key = find_needle({
        haystack: $brightcove_script_text,
        needle:   ',policyKey:"',
        tail:     '"'
      })

      debug('policy_key: ' + state.policy_key)
      if (!state.policy_key) return

      var series_id = unsafeWindow.location.pathname
      if ((series_id.length < 2) || (series_id[0] !== '/')) return
      series_id = series_id.split('/')[1]
      debug('series_id: ' + series_id)

      download_json(
        /* url= */ 'https://component-cdn.swm.digital/content/' + series_id + '?platform-id=web&market-id=-1&platform-version=1.0.100878&api-version=4.9',
        /* headers= */ null,
        /* data= */ null,
        function(series_data) {
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

          callback()
        }
      )
    })
  }

  var find_needle = function(data) {
    var index_start, index_stop

    index_start = data.haystack.indexOf(data.needle)
    if (index_start >= 0) {
      index_start += data.needle.length
      index_stop = data.haystack.indexOf(data.tail, index_start)
      if (index_stop >= index_start) {
        return data.haystack.substring(index_start, index_stop)
      }
    }
    return null
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

  // -----------------------------------------------------------------------------

  download_series_media_items(function() {
    console.log(
      JSON.stringify(state, null, 2)
    )
  })

})()

// =======
// output:
// =======

/*

account_id: 5303576322001
policy_key: BCpkADawqM33sxTxTSkUGuTlYrSr1IWKvoedldJ6w01PbfYMPMDR2OSumoyEdKusPv2UC6g_bidqbcAkLzVwSOgD1Yea5O3V0Wu35n2lWGq1FmNDHB4dhwcTqJ7Z3GNoI-mfkmi6xMpLPBAN index.esm.js:13:366
series_id: gilmore-girls index.esm.js:13:366
series_data: object index.esm.js:13:366
items: object (array) index.esm.js:13:366
episodes: object (21) index.esm.js:13:366
{
  "account_id": "5303576322001",
  "policy_key": "BCpkADawqM33sxTxTSkUGuTlYrSr1IWKvoedldJ6w01PbfYMPMDR2OSumoyEdKusPv2UC6g_bidqbcAkLzVwSOgD1Yea5O3V0Wu35n2lWGq1FmNDHB4dhwcTqJ7Z3GNoI-mfkmi6xMpLPBAN",
  "series": {
    "title": "Gilmore Girls",
    "summary": "Watch, Stream & Catch Up with your favourite Gilmore Girls episodes on 7plus. In Stars Hollow, Connecticut, Lorelai Gilmore and her teenage daughter, Rory, navigate life, love, and the echoes of Lorelai's rebellious youth."
  },
  "episodes": [
    {
      "title": "S1 E1 - Pilot",
      "reference_id": "GILG01-001",
      "summary": "When Rory gets accepted to a fancy prep school, Lorelai is forced to humble herself and ask her mother for help in paying the tuition.",
      "duration": "42m",
      "expires": null
    },
    {
      "title": "S1 E2 - The Lorelais' First Day At Chilton",
      "reference_id": "GILG01-002",
      "summary": "A T-shirt, shorts and cowboy boots-clad Lorelai accompanies Rory on her first day at school, drawing disapproving stares from the other mothers and from Lorelai's own mother, Emily.",
      "duration": "42m",
      "expires": null
    },
    {
      "title": "S1 E3 - Kill Me Now",
      "reference_id": "GILG01-003",
      "summary": "When Richard and Rory form an instant bond during a wonderful day of golf, Lorelai feels left out and finds it difficult to observe Rory's emotional connection with Emily and Richard.",
      "duration": "41m",
      "expires": null
    },
    {
      "title": "S1 E4 - The Deer-Hunters",
      "reference_id": "GILG01-004",
      "summary": "Rory has trouble getting good grades at her new school. Lorelai becomes interested in Rory's handsome teacher.",
      "duration": "42m",
      "expires": null
    },
    {
      "title": "S1 E5 - Cinnamon's Wake",
      "reference_id": "GILG01-005",
      "summary": "Lorelai forgets to tell Rory that she has a date with Rory's teacher Max. Rory has a new crush.",
      "duration": "40m",
      "expires": null
    },
    {
      "title": "S1 E6 - Rory's Birthday Parties",
      "reference_id": "GILG01-006",
      "summary": "Rory gets upset at Emily, who plans a formal birthday party for her but feels that Rory is being ungrateful when Rory reveals that she would not like to have a formal birthday party.",
      "duration": "43m",
      "expires": null
    },
    {
      "title": "S1 E7 - Kiss And Tell",
      "reference_id": "GILG01-007",
      "summary": "Rory decides not to tell her mother that she and Dean have kissed. Lorelai takes the liberty of inviting Dean over, and Rory is embarrassed by her mother's actions.",
      "duration": "43m",
      "expires": null
    },
    {
      "title": "S1 E8 - Love & War & Snow",
      "reference_id": "GILG01-008",
      "summary": "Lorelai shares a wonderful day with Max while Rory is snowed in at her grandparents' home. Lane misses Rory and comes to visit.",
      "duration": "43m",
      "expires": null
    },
    {
      "title": "S1 E9 - Rory's Dance",
      "reference_id": "GILG01-009",
      "summary": "Rory goes to the dance with Dean, who clashes with two jealous boys. They fall asleep in Miss Patty's studio, and Rory rushes home to find her mother and grandmother arguing about her future.",
      "duration": "43m",
      "expires": null
    },
    {
      "title": "S1 E10 - Forgiveness And Stuff",
      "reference_id": "GILG01-010",
      "summary": "Richard collapses at the Gilmores' Christmas party. Dean assures Lorelai that nothing improper happened on the night he and Rory fell asleep together.",
      "duration": "41m",
      "expires": null
    },
    {
      "title": "S1 E11 - Paris Is Burning",
      "reference_id": "GILG01-011",
      "summary": "Paris exposes Lorelai and Max's relationship, causing a scandal and their breakup. Rory confronts Paris, who admits she wanted to deflect attention from her parents' divorce.",
      "duration": "43m",
      "expires": null
    },
    {
      "title": "S1 E12 - Double Date",
      "reference_id": "GILG01-012",
      "summary": "Lorelai finds herself on a hellish double date with Sookie, Jackson, and Jackson's very odd cousin. Meanwhile Rory double dates with Dean, Lane, and Dean's friend. They keep their plans secret.",
      "duration": "40m",
      "expires": null
    },
    {
      "title": "S1 E13 - Concert Interruptus",
      "reference_id": "GILG01-013",
      "summary": "Trouble occurs when Rory brings her friends to a concert by The Bangles.",
      "duration": "38m",
      "expires": null
    },
    {
      "title": "S1 E14 - That Damn Donna Reed",
      "reference_id": "GILG01-014",
      "summary": "Rory and Dean disagree about women's roles after watching \"The Donna Reed Show.\"",
      "duration": "43m",
      "expires": null
    },
    {
      "title": "S1 E15 - Christopher Returns",
      "reference_id": "GILG01-015",
      "summary": "Rory's father, Christopher, returns, causing tension in Emily and Richard's house and forcing Lorelai to make a big decision about her family's future.",
      "duration": "41m",
      "expires": null
    },
    {
      "title": "S1 E16 - Star-Crossed Lovers & Other Strangers",
      "reference_id": "GILG01-016",
      "summary": "Dean and Rory share a special evening as the town celebrates its romantic history.",
      "duration": "43m",
      "expires": null
    },
    {
      "title": "S1 E17 - The Breakup, Part II",
      "reference_id": "GILG01-017",
      "summary": "Dean breaks up with Rory on their third anniversary. At a party, Rory meets Tristin, who kisses her, making her realize her confusion and misery. Meanwhile, Lorelai and Max rekindle their romance.",
      "duration": "43m",
      "expires": null
    },
    {
      "title": "S1 E18 - The Third Lorelai",
      "reference_id": "GILG01-018",
      "summary": "Emily fears losing contact with Lorelai and Rory if they accept a trust fund. Rory feels awkward around Tristin after their kiss and tries to pair him with Paris, unaware of his interest in her.",
      "duration": "43m",
      "expires": null
    },
    {
      "title": "S1 E19 - Emily In Wonderland",
      "reference_id": "GILG01-019",
      "summary": "Emily tries to create the perfect bedroom for Rory in her house. Lorelai convinces Luke to give his former girlfriend a chance to reconcile with him.",
      "duration": "41m",
      "expires": null
    },
    {
      "title": "S1 E20 - P.S. I Lo...",
      "reference_id": "GILG01-020",
      "summary": "Rory, upset over Dean, gets angry at Lorelai for not mentioning Max. Dean tells Lorelai he left because Rory couldn't say \"I love you,\" prompting Lorelai to encourage Rory to express her feelings.",
      "duration": "42m",
      "expires": null
    },
    {
      "title": "S1 E21 - Love, Daisies & Troubadours",
      "reference_id": "GILG01-021",
      "summary": "Rory tells Dean she loves him. Rachel leaves, sensing Lorelai and Luke's attraction. Max proposes to Lorelai, who rebuffs him. The next day, Max proposes again with daisies, and Lorelai considers it.",
      "duration": "42m",
      "expires": null
    }
  ]
}

*/
