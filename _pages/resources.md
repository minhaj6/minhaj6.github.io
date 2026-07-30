---
layout: archive
title: "Resources"
permalink: /resources/
author_profile: true
---

{% include base_path %}

A running list of GNSS / GPS books, courses, and websites I have found useful and enjoy. Mostly focused on satellite navigation, software-defined receivers, and signal processing.

## Books

<div class="book-gallery">
{% for book in site.data.gnss_books %}
  <figure class="book-card">
    {% if book.url %}<a href="{{ book.url }}" target="_blank" rel="noopener">{% endif %}
      {% if book.cover %}
        <img class="book-cover" src="{{ base_path }}/images/book_covers/{{ book.cover }}" alt="Cover of {{ book.title }}">
      {% else %}
        <span class="book-cover book-cover--placeholder" style="--accent: {{ book.accent | default: '#3a3f4a' }}">
          <span class="book-cover__title">{{ book.title }}</span>
          <span class="book-cover__author">{{ book.author }}</span>
        </span>
      {% endif %}
    {% if book.url %}</a>{% endif %}
    <figcaption class="book-meta">
      <span class="book-title">{{ book.title }}</span>
      <span class="book-author">{{ book.author }}{% if book.year %} · {{ book.year }}{% endif %}</span>
      {% if book.note %}<span class="book-note">{{ book.note }}</span>{% endif %}
    </figcaption>
  </figure>
{% endfor %}
</div>

## Courses & Videos

- **Stanford — GPS: An Introduction to Satellite Navigation** — [YouTube playlist](https://www.youtube.com/playlist?list=PLGvhNIiu1ubyEOJga50LJMzVXtbUq6CPo).
- **How GPS Works** — a nice short explainer: [youtu.be/qJ7ZAUjsycY](https://youtu.be/qJ7ZAUjsycY).
- **Penn State GEOG 862 — GPS and GNSS for Geospatial Professionals** — [free online course](https://www.e-education.psu.edu/geog862/node/1407).

## Websites

- **ESA Navipedia** — an excellent GNSS encyclopedia: [gssc.esa.int/navipedia](https://gssc.esa.int/navipedia/index.php?title=User_Guides).
- **SDR GPS blog** — [sdrgps.blogspot.com](https://sdrgps.blogspot.com/).
- **Least Squares GPS** — Mitchell Johnson's walkthrough: [johnsonmitchelld.com](https://www.johnsonmitchelld.com/2021/03/14/least-squares-gps.html).

<style>
.book-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1.6em 1.4em;
  margin: 1.5em 0 2em;
}
.book-card { margin: 0; }
.book-card a { text-decoration: none; }
.book-cover {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.book-card:hover .book-cover {
  transform: translateY(-3px);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.28);
}
.book-cover--placeholder {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding: 1em 0.85em 1em 1.05em;
  color: #fff;
  text-align: left;
  background: linear-gradient(135deg, var(--accent), rgba(0, 0, 0, 0.6));
  border-left: 6px solid rgba(255, 255, 255, 0.35);
}
.book-cover__title { font-weight: 700; font-size: 0.92em; line-height: 1.25; }
.book-cover__author { margin-top: auto; padding-top: 0.6em; font-size: 0.72em; opacity: 0.85; }
.book-meta { margin-top: 0.6em; display: flex; flex-direction: column; }
.book-title { font-weight: 600; font-size: 0.85em; line-height: 1.25; }
.book-author { margin-top: 0.15em; font-size: 0.76em; color: #6b7280; }
.book-note { margin-top: 0.4em; font-size: 0.78em; color: #4b5563; line-height: 1.4; }
</style>
