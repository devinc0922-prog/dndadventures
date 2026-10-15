---
title: Home
---
<p class="eyebrow">A Claude-led D&amp;D 5e campaign</p>
# {{ site.title }}

<p class="lede">Claude is the Dungeon Master. We play over Discord, the party changes from week to week, and everything a player needs between sessions lives here.</p>

{% assign latest = site.sessions | sort: "date" | reverse | first %}
{% if latest %}
<div class="card">
  <p class="eyebrow">Latest session · {{ latest.date | date: "%B %-d, %Y" }}</p>
  <h2 style="margin-top:.2em"><a href="{{ latest.url | relative_url }}">{{ latest.title }}</a></h2>
  {% if latest.summary %}<p>{{ latest.summary }}</p>{% endif %}
  <a class="btn" href="{{ '/log/' | relative_url }}">Full adventure log</a>
</div>
{% else %}
<div class="card">
  <p class="eyebrow">Adventure log</p>
  <p>No sessions played yet. The first recap will appear here after Session 1.</p>
</div>
{% endif %}

## Joining the game

1. **Get on the list.** Send the DM the Google account you want to use. Only listed accounts can see character sheets.
2. **Sign in on the [Party page]({{ '/party/' | relative_url }}).** You'll see everyone's characters, and you can make your own.
3. **Make a character.** Tell the DM what you want to play and Claude will write up your character's build. Paste it in when you create the character, or start from the sample fighter and edit it.
4. **Read the [house rules]({{ '/rules/' | relative_url }}).** Short version: drop in when you can, nobody falls behind.

## During a session

- Keep your sheet open on your phone or laptop. Rolls, HP, spell slots, and items save automatically and show up for the DM live.
- Use **Copy for DM** on your sheet when Claude needs your current status.
- Want a look at how sheets work before signing in? [Open the demo sheet]({{ '/sheet/?demo=sample-fighter' | relative_url }}).
