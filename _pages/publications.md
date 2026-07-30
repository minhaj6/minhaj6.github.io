---
layout: archive
title: "Publications"
permalink: /publications/
author_profile: true
---

{% if author.googlescholar %}
You can also find my articles on <u><a href="{{author.googlescholar}}">my Google Scholar profile</a></u>.
{% endif %}

{% include base_path %}

{% assign journal = site.publications | where: "category", "journal" | sort: "date" | reverse %}
{% assign books = site.publications | where: "category", "books" | sort: "date" | reverse %}
{% assign conferences = site.publications | where: "category", "conferences" | sort: "date" | reverse %}

{% if journal.size > 0 %}
<h2>Journal Articles</h2>
<ul class="publication-list">
{% for post in journal %}
  <li><span class="pub-id">[J.{{ forloop.rindex }}]</span> <span class="pub-cite">{{ post.citation }}{% if post.paperurl %} [<a href="{{ post.paperurl }}">paper</a>]{% endif %}</span></li>
{% endfor %}
</ul>
{% endif %}

{% if books.size > 0 %}
<h2>Book Chapters</h2>
<ul class="publication-list">
{% for post in books %}
  <li><span class="pub-id">[B.{{ forloop.rindex }}]</span> <span class="pub-cite">{{ post.citation }}{% if post.paperurl %} [<a href="{{ post.paperurl }}">paper</a>]{% endif %}</span></li>
{% endfor %}
</ul>
{% endif %}

{% if conferences.size > 0 %}
<h2>Conference Proceedings &amp; Presentations</h2>
<ul class="publication-list">
{% for post in conferences %}
  <li><span class="pub-id">[C.{{ forloop.rindex }}]</span> <span class="pub-cite">{{ post.citation }}{% if post.paperurl %} [<a href="{{ post.paperurl }}">paper</a>]{% endif %}</span></li>
{% endfor %}
</ul>
{% endif %}

<style>
.publication-list { list-style: none; padding-left: 0; }
.publication-list li { display: flex; margin-bottom: 0.75em; }
.publication-list .pub-id { flex: 0 0 auto; margin-right: 0.5em; font-weight: bold; white-space: nowrap; }
</style>
