=== ProPortfolio Showcase ===
Contributors: dejonj
Tags: portfolio, projects, showcase, custom post type, gutenberg block, shortcode
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A WordPress plugin for showcasing portfolio projects with custom post types, Gutenberg blocks, shortcodes, widgets, and a REST API endpoint.

== Description ==

ProPortfolio Showcase is a comprehensive portfolio project management plugin for WordPress. It allows you to create, manage, and display portfolio projects with rich meta data including client names, technologies used, completion dates, client testimonials, and more.

= Features =

* **Custom Post Type** — `portfolio_project` with full archive, REST API support, and block editor compatibility
* **Custom Taxonomy** — `project_category` for organizing projects
* **Gutenberg Block** — "Portfolio Grid" block with server-side rendering (no JavaScript build step required)
* **Shortcodes** — `[proportfolio_grid]` for grids and `[proportfolio_single]` for individual projects
* **Widget** — "ProPortfolio Recent Projects" for sidebars
* **Custom REST API** — `/wp-json/proportfolio/v1/projects` with filtering, pagination, and caching headers
* **Meta Fields** — Native `register_meta()` with REST exposure, auto-detects ACF for enhanced editing
* **Admin Settings** — Configurable archive heading, per-page count, and URL slug
* **Demo Data** — One-click seeding of 6 realistic demo projects
* **SEO Ready** — Schema.org microdata, semantic HTML5, accessible markup
* **i18n Ready** — All strings translatable, included .pot file

= Demo Projects =

The plugin can seed 6 demo projects based on real-world experience:
1. City of Detroit — Election Portal Redesign
2. NotDJ — Touch DJ Controller PWA
3. Goya Art — E-commerce Storefront
4. Inventory Management System — City of Detroit
5. Community Polling Worker App — PWA
6. Notion-style Task Manager — React/Next.js

== Installation ==

1. Upload the `proportfolio-showcase` folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' screen in WordPress
3. Go to Settings → ProPortfolio → Demo Data to seed demo projects
4. Add `[proportfolio_grid]` to any page or use the "Portfolio Grid" block in the editor

== Frequently Asked Questions ==

= How do I display portfolio projects? =

You have several options:
* Use the `[proportfolio_grid count="6" columns="3"]` shortcode
* Add the "Portfolio Grid" Gutenberg block to any post or page
* Visit the `/portfolio/` archive page
* Add the "ProPortfolio Recent Projects" widget to a sidebar

= Can I override the templates? =

Yes. Copy `templates/single-portfolio_project.php` or `templates/archive-portfolio_project.php` to your theme's root directory and customize as needed.

= Does this require ACF? =

No. The plugin registers all meta fields natively using WordPress's `register_meta()` API. If Advanced Custom Fields is installed, it will automatically use ACF for a richer editing experience.

= How do I use the REST API? =

The custom endpoint is available at `/wp-json/proportfolio/v1/projects`. It supports pagination (`?per_page=10&page=1`), category filtering (`?category=ID`), featured filtering (`?featured=true`), and text search (`?search=keyword`).

== Screenshots ==

1. Portfolio grid displayed via shortcode
2. Single project view with testimonial
3. Admin settings page
4. Meta fields on the project edit screen
5. Custom list table columns

== Changelog ==

= 1.0.0 =
* Initial release
* Custom Post Type and Taxonomy
* Gutenberg block with server-side rendering
* Shortcodes, widget, and REST API
* Native meta fields with ACF auto-detection
* Admin settings page with demo data seeder
* Responsive CSS grid layout
* Full i18n support
* Complete uninstall cleanup

== Upgrade Notice ==

= 1.0.0 =
Initial release.