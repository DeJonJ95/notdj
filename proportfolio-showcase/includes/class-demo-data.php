<?php
/**
 * Demo data seeder for portfolio projects.
 *
 * Provides one-click demo content creation with realistic project examples.
 *
 * @package ProPortfolio_Showcase
 */

namespace ProPortfolio\Includes;

defined( 'ABSPATH' ) || exit;

/**
 * Seeds and manages demo portfolio projects.
 */
class Demo_Data {

	/**
	 * Seed demo portfolio projects.
	 *
	 * Creates 6 realistic projects, categories, and all meta fields.
	 * Checks for existing demo data before proceeding.
	 *
	 * @return array Result with 'success' bool and 'message' string.
	 */
	public function seed() {
		if ( has_demo_data() ) {
			return array(
				'success' => false,
				'message' => __( 'Demo data has already been seeded. Remove existing demo data first if you want to re-seed.', 'proportfolio-showcase' ),
			);
		}

		// Create categories first.
		$categories = $this->create_categories();
		if ( empty( $categories ) ) {
			return array(
				'success' => false,
				'message' => __( 'Failed to create project categories.', 'proportfolio-showcase' ),
			);
		}

		// Define demo projects.
		$projects = $this->get_demo_projects( $categories );

		$created = 0;
		foreach ( $projects as $project_data ) {
			$post_id = $this->create_project( $project_data );
			if ( $post_id ) {
				$created++;
			}
		}

		if ( $created > 0 ) {
			update_option( '_proportfolio_demo_seeded', true );
			flush_rewrite_rules();

			return array(
				'success' => true,
				'message' => sprintf(
				/* translators: %d: number of projects created */
					__( 'Successfully created %d demo projects with meta fields, categories, and technologies.', 'proportfolio-showcase' ),
					$created
				),
			);
		}

		return array(
			'success' => false,
			'message' => __( 'No demo projects were created. Please check your WordPress configuration.', 'proportfolio-showcase' ),
		);
	}

	/**
	 * Remove all demo data.
	 *
	 * @return array Result with 'success' bool and 'message' string.
	 */
	public function remove() {
		if ( ! has_demo_data() ) {
			return array(
				'success' => false,
				'message' => __( 'No demo data found to remove.', 'proportfolio-showcase' ),
			);
		}

		$projects = get_posts(
			array(
				'post_type'      => 'portfolio_project',
				'posts_per_page' => 100,
				'post_status'    => 'any',
				'fields'         => 'ids',
			)
		);

		$deleted = 0;
		foreach ( $projects as $post_id ) {
			if ( wp_delete_post( $post_id, true ) ) {
				$deleted++;
			}
		}

		// Remove demo-created terms.
		$terms = get_terms(
			array(
				'taxonomy'   => 'project_category',
				'hide_empty' => false,
				'fields'     => 'ids',
			)
		);
		if ( ! is_wp_error( $terms ) ) {
			foreach ( $terms as $term_id ) {
				wp_delete_term( $term_id, 'project_category' );
			}
		}

		delete_option( '_proportfolio_demo_seeded' );

		return array(
			'success' => true,
			'message' => sprintf(
			/* translators: %d: number of projects deleted */
				__( 'Removed %d demo projects and associated data.', 'proportfolio-showcase' ),
				$deleted
			),
		);
	}

	/**
	 * Create project categories.
	 *
	 * @return array Associative array of slug => term_id.
	 */
	private function create_categories() {
		$category_names = array(
			__( 'Web Application', 'proportfolio-showcase' ),
			__( 'E-commerce', 'proportfolio-showcase' ),
			__( 'Dashboard / Tool', 'proportfolio-showcase' ),
		);

		$categories = array();
		foreach ( $category_names as $name ) {
			$term = wp_insert_term( $name, 'project_category' );

			if ( is_wp_error( $term ) && isset( $term->error_data['term_exists'] ) ) {
				$categories[ sanitize_title( $name ) ] = (int) $term->error_data['term_exists'];
			} elseif ( ! is_wp_error( $term ) ) {
				$categories[ sanitize_title( $name ) ] = (int) $term['term_id'];
			}
		}

		return $categories;
	}

	/**
	 * Define the demo project data.
	 *
	 * Each project maps to real experience from the developer's background.
	 *
	 * @param array $categories Associative array of category slugs to IDs.
	 * @return array Array of project data arrays.
	 */
	private function get_demo_projects( $categories ) {
		$web_app    = isset( $categories['web-application'] ) ? $categories['web-application'] : 0;
		$ecommerce  = isset( $categories['e-commerce'] ) ? $categories['e-commerce'] : 0;
		$dashboard  = isset( $categories['dashboard-tool'] ) ? $categories['dashboard-tool'] : 0;

		return array(
			array(
				'title'           => __( 'City of Detroit — Election Portal Redesign', 'proportfolio-showcase' ),
				'content'         => __( 'Led the redesign and rebuild of the City of Detroit election information portal, serving millions of voters. The project focused on accessibility compliance (WCAG 2.1 AA), mobile responsiveness, and clear information architecture. Rebuilt the voter registration lookup tool, polling place finder, and ballot preview system using a headless WordPress backend with a custom React frontend.', 'proportfolio-showcase' ),
				'excerpt'         => __( 'Redesigned city election portal with WCAG 2.1 AA compliance, serving millions of voters with accessible polling place and ballot information.', 'proportfolio-showcase' ),
				'client'          => __( 'City of Detroit', 'proportfolio-showcase' ),
				'completion_date' => '2025-03-15',
				'technologies'    => array( 'WordPress', 'React', 'PHP', 'WCAG', 'JavaScript' ),
				'featured'        => true,
				'project_url'     => 'https://detroitmi.gov/',
				'testimonial'     => __( 'DeJon brought a level of technical rigor and accessibility awareness that transformed how we deliver civic information to Detroit residents.', 'proportfolio-showcase' ),
				'testimonial_author' => __( 'IT Director, City of Detroit', 'proportfolio-showcase' ),
				'category'        => $web_app,
			),
			array(
				'title'           => __( 'NotDJ — Touch DJ Controller PWA', 'proportfolio-showcase' ),
				'content'         => __( 'Built a progressive web application that turns the browser into a touch-based DJ controller. Features include dual-deck playback, waveform visualization, crossfader, EQ controls, and beat-synced effects. Built as a client-side PWA with AudioContext API, Service Workers for offline playback, and IndexedDB for library management.', 'proportfolio-showcase' ),
				'excerpt'         => __( 'A client-side PWA that transforms the browser into a fully functional DJ controller with dual-deck playback and waveform visualization.', 'proportfolio-showcase' ),
				'client'          => __( 'Personal Project', 'proportfolio-showcase' ),
				'completion_date' => '2024-08-20',
				'technologies'    => array( 'JavaScript', 'PWA', 'Canvas API', 'Web Audio API', 'CSS3' ),
				'featured'        => true,
				'project_url'     => 'https://notdijon.com/',
				'testimonial'     => '',
				'testimonial_author' => '',
				'category'        => $web_app,
			),
			array(
				'title'           => __( 'Goya Art — E-commerce Storefront', 'proportfolio-showcase' ),
				'content'         => __( 'Designed and built a WooCommerce-powered e-commerce storefront for an art gallery, featuring custom product catalogs, Stripe payment integration, and a streamlined checkout experience. Implemented inventory tracking, print-on-demand fulfillment workflows, and a custom product configurator for framed vs. unframed prints.', 'proportfolio-showcase' ),
				'excerpt'         => __( 'WooCommerce storefront for an art gallery with custom product catalogs, Stripe payments, and print-on-demand fulfillment.', 'proportfolio-showcase' ),
				'client'          => __( 'Goya Art Gallery', 'proportfolio-showcase' ),
				'completion_date' => '2024-11-10',
				'technologies'    => array( 'WordPress', 'WooCommerce', 'Stripe', 'PHP', 'PayPal' ),
				'featured'        => true,
				'project_url'     => '',
				'testimonial'     => __( 'Our online sales doubled in the first quarter after launch. The custom product configurator was exactly what we needed.', 'proportfolio-showcase' ),
				'testimonial_author' => __( 'Gallery Owner, Goya Art', 'proportfolio-showcase' ),
				'category'        => $ecommerce,
			),
			array(
				'title'           => __( 'Inventory Management System — City of Detroit', 'proportfolio-showcase' ),
				'content'         => __( 'Designed and shipped an internal inventory management web application tracking 23,000+ items across 20 locations for the City of Detroit. Features include barcode scanning, real-time stock levels, transfer orders between locations, audit trail logging, and role-based access control. Built with a custom WordPress backend and a responsive JavaScript frontend.', 'proportfolio-showcase' ),
				'excerpt'         => __( 'Internal inventory tool tracking 23,000+ items across 20 city locations with barcode scanning and real-time stock management.', 'proportfolio-showcase' ),
				'client'          => __( 'City of Detroit', 'proportfolio-showcase' ),
				'completion_date' => '2025-01-30',
				'technologies'    => array( 'WordPress', 'PHP', 'JavaScript', 'SQL', 'REST API' ),
				'featured'        => false,
				'project_url'     => '',
				'testimonial'     => '',
				'testimonial_author' => '',
				'category'        => $dashboard,
			),
			array(
				'title'           => __( 'Community Polling Worker App — PWA', 'proportfolio-showcase' ),
				'content'         => __( 'Developed a progressive web application for managing polling worker assignments, training tracking, and shift scheduling during elections. Features offline-first data entry, GPS-based polling location check-in, and real-time notifications for schedule changes. Used by election officials and polling workers across precincts.', 'proportfolio-showcase' ),
				'excerpt'         => __( 'Offline-first PWA for polling worker management, training tracking, and election day coordination across precincts.', 'proportfolio-showcase' ),
				'client'          => __( 'City of Detroit Elections', 'proportfolio-showcase' ),
				'completion_date' => '2024-06-15',
				'technologies'    => array( 'JavaScript', 'PWA', 'PHP', 'SQL', 'REST API' ),
				'featured'        => false,
				'project_url'     => '',
				'testimonial'     => __( 'The offline capability saved us on election day when network connectivity was spotty. Everything just worked.', 'proportfolio-showcase' ),
				'testimonial_author' => __( 'Elections IT Manager, City of Detroit', 'proportfolio-showcase' ),
				'category'        => $dashboard,
			),
			array(
				'title'           => __( 'Notion-style Task Manager — React/Next.js Frontend', 'proportfolio-showcase' ),
				'content'         => __( 'Built a full-featured task management application with a Notion-inspired interface using Next.js and React. Features include drag-and-drop kanban boards, markdown note editing, tag/filter system, collaborative editing foundations, and a custom REST API backend. Demonstrates modern React patterns including hooks, context API, and server-side rendering.', 'proportfolio-showcase' ),
				'excerpt'         => __( 'Full-featured Notion-style task manager with kanban boards, drag-and-drop, and markdown editing built on Next.js.', 'proportfolio-showcase' ),
				'client'          => __( 'Personal Project', 'proportfolio-showcase' ),
				'completion_date' => '2025-05-01',
				'technologies'    => array( 'React', 'Next.js', 'JavaScript', 'Tailwind CSS', 'REST API' ),
				'featured'        => false,
				'project_url'     => 'https://notdijon.com/',
				'testimonial'     => '',
				'testimonial_author' => '',
				'category'        => $web_app,
			),
		);
	}

	/**
	 * Create a single demo portfolio project.
	 *
	 * @param array $data Project data.
	 * @return int|false Post ID on success, false on failure.
	 */
	private function create_project( $data ) {
		$post_id = wp_insert_post(
			array(
				'post_title'    => sanitize_text_field( $data['title'] ),
				'post_content'  => wp_kses_post( $data['content'] ),
				'post_excerpt'  => sanitize_text_field( $data['excerpt'] ),
				'post_status'   => 'publish',
				'post_type'     => 'portfolio_project',
				'post_date'     => $data['completion_date'] . ' 09:00:00',
				'post_author'   => get_current_user_id(),
			),
			true
		);

		if ( is_wp_error( $post_id ) ) {
			return false;
		}

		// Set category.
		if ( ! empty( $data['category'] ) ) {
			wp_set_post_terms( $post_id, array( (int) $data['category'] ), 'project_category' );
		}

		// Set meta fields.
		$meta_fields = array(
			'project_url'              => esc_url_raw( $data['project_url'] ),
			'project_client'           => sanitize_text_field( $data['client'] ),
			'project_completion_date'  => \ProPortfolio\Includes\sanitize_date( $data['completion_date'] ),
			'project_technologies'     => \ProPortfolio\Includes\sanitize_technologies( $data['technologies'] ),
			'project_featured'         => $data['featured'] ? '1' : '0',
			'project_testimonial'      => sanitize_textarea_field( $data['testimonial'] ),
			'project_testimonial_author' => sanitize_text_field( $data['testimonial_author'] ),
		);

		foreach ( $meta_fields as $key => $value ) {
			update_post_meta( $post_id, $key, $value );
		}

		// Generate a placeholder featured image (colored SVG).
		$this->set_placeholder_image( $post_id );

		return $post_id;
	}

	/**
	 * Generate and attach a placeholder SVG as the featured image.
	 *
	 * Creates a simple colored SVG inline and attaches it to the post.
	 *
	 * @param int $post_id Post ID.
	 * @return void
	 */
	private function set_placeholder_image( $post_id ) {
		$colors = array( '#4A90D9', '#7B61FF', '#E06C75', '#56B6C2', '#E5C07B', '#98C379' );
		$color  = $colors[ $post_id % count( $colors ) ];
		$title  = get_the_title( $post_id );

		$svg = sprintf(
			'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750">
				<rect width="1200" height="750" fill="%s"/>
				<rect x="40" y="40" width="1120" height="670" rx="12" fill="rgba(255,255,255,0.08)"/>
				<text x="600" y="340" text-anchor="middle" fill="rgba(255,255,255,0.9)" font-family="system-ui,sans-serif" font-size="64" font-weight="600">📁</text>
				<text x="600" y="420" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-family="system-ui,sans-serif" font-size="20">%s</text>
			</svg>',
			$color,
			esc_html( $title )
		);

		$upload_dir = wp_upload_dir();
		$file_name  = 'proportfolio-placeholder-' . $post_id . '.svg';
		$file_path  = $upload_dir['path'] . '/' . $file_name;

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $file_path, $svg );

		$file_type = 'image/svg+xml';

		$attachment_id = wp_insert_attachment(
			array(
				'guid'           => $upload_dir['url'] . '/' . $file_name,
				'post_mime_type' => $file_type,
				'post_title'     => sanitize_file_name( $file_name ),
				'post_content'   => '',
				'post_status'    => 'inherit',
			),
			$file_path,
			$post_id
		);

		if ( ! is_wp_error( $attachment_id ) && $attachment_id ) {
			set_post_thumbnail( $post_id, $attachment_id );
		}
	}
}