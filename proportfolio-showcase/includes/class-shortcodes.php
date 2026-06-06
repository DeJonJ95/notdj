<?php
/**
 * Shortcode registration and rendering.
 *
 * Provides [proportfolio_grid] and [proportfolio_single] shortcodes.
 *
 * @package ProPortfolio_Showcase
 */

namespace ProPortfolio\Includes;

defined( 'ABSPATH' ) || exit;

/**
 * Handles shortcode registration and output.
 */
class Shortcodes {

	/**
	 * Register all shortcodes.
	 *
	 * @return void
	 */
	public function register() {
		add_shortcode( 'proportfolio_grid', array( $this, 'render_grid' ) );
		add_shortcode( 'proportfolio_single', array( $this, 'render_single' ) );
	}

	/**
	 * Render a grid of portfolio projects.
	 *
	 * Attributes:
	 *   count        – Number of projects to show (default 6).
	 *   category     – Slug to filter by (default empty).
	 *   columns      – Grid columns 1-4 (default 3).
	 *   show_filter  – Show category filter tabs (default true).
	 *   orderby      – date|title|rand (default date).
	 *   order        – ASC|DESC (default DESC).
	 *   featured_only – Show only featured projects (default false).
	 *
	 * @param array $atts Shortcode attributes.
	 * @return string HTML output.
	 */
	public function render_grid( $atts ) {
			return self::render_grid_static( $atts, 'shortcode' );
		}

		/**
		 * Static grid renderer (shared between shortcode and block).
		 *
		 * @param array  $atts   Display attributes.
		 * @param string $context 'shortcode' or 'block'.
		 * @return string HTML output.
		 */
		public static function render_grid_static( $atts, $context = 'shortcode' ) {
			$instance = new self();
			if ( 'block' === $context ) {
				$atts['show_filter'] = isset( $atts['showFilter'] ) ? $atts['showFilter'] : true;
			}
			return $instance->render_grid_internal( $atts );
		}

		/**
		 * Internal grid renderer.
		 *
		 * @param array $atts Sanitized attributes.
		 * @return string HTML output.
		 */
		private function render_grid_internal( $atts ) {
		$atts = shortcode_atts(
			array(
				'count'         => 6,
				'category'      => '',
				'columns'       => 3,
				'show_filter'   => true,
				'orderby'       => 'date',
				'order'         => 'DESC',
				'featured_only' => false,
			),
			$atts,
			'proportfolio_grid'
		);

		// Sanitize.
		$count         = absint( $atts['count'] );
		$columns       = max( 1, min( 4, absint( $atts['columns'] ) ) );
		$category      = sanitize_text_field( $atts['category'] );
		$show_filter   = rest_sanitize_boolean( $atts['show_filter'] );
		$orderby       = in_array( $atts['orderby'], array( 'date', 'title', 'rand' ), true ) ? $atts['orderby'] : 'date';
		$order         = in_array( strtoupper( $atts['order'] ), array( 'ASC', 'DESC' ), true ) ? strtoupper( $atts['order'] ) : 'DESC';
		$featured_only = rest_sanitize_boolean( $atts['featured_only'] );

		// Cap the count to prevent runaway queries.
		if ( $count < 1 ) {
			$count = 1;
		}
		if ( $count > 48 ) {
			$count = 48;
		}

		$query_args = array(
			'post_type'      => 'portfolio_project',
			'posts_per_page' => $count,
			'orderby'        => $orderby,
			'order'          => $order,
			'post_status'    => 'publish',
		);

		if ( ! empty( $category ) ) {
			$query_args['tax_query'] = array(
				array(
					'taxonomy' => 'project_category',
					'field'    => 'slug',
					'terms'    => $category,
				),
			);
		}

		if ( $featured_only ) {
			$query_args['meta_query'] = array(
				array(
					'key'   => 'project_featured',
					'value' => '1',
				),
			);
		}

		$projects = new \WP_Query( $query_args );

		ob_start();

		$template_path = PROPORTFOLIO_PATH . 'templates/shortcode-grid.php';
		if ( file_exists( $template_path ) ) {
			include $template_path;
		} else {
			// Fallback inline rendering.
			$this->render_grid_inline( $projects, $columns, $show_filter );
		}

		wp_reset_postdata();

		return ob_get_clean();
	}

	/**
	 * Render a single portfolio project by ID.
	 *
	 * Attributes:
	 *   id               – Post ID (required).
	 *   show_testimonial – Show testimonial block (default true).
	 *   show_technologies – Show technologies list (default true).
	 *
	 * @param array $atts Shortcode attributes.
	 * @return string HTML output or empty string if project not found.
	 */
	public function render_single( $atts ) {
		$atts = shortcode_atts(
			array(
				'id'               => 0,
				'show_testimonial' => true,
				'show_technologies' => true,
			),
			$atts,
			'proportfolio_single'
		);

		$post_id = absint( $atts['id'] );
		if ( $post_id < 1 ) {
			return sprintf(
				'<p class="proportfolio-error">%s</p>',
				esc_html__( 'Error: No project ID specified.', 'proportfolio-showcase' )
			);
		}

		$post = get_post( $post_id );
		if ( ! $post || 'portfolio_project' !== $post->post_type || 'publish' !== $post->post_status ) {
			return sprintf(
				'<p class="proportfolio-error">%s</p>',
				esc_html__( 'Error: Project not found.', 'proportfolio-showcase' )
			);
		}

		$show_testimonial  = rest_sanitize_boolean( $atts['show_testimonial'] );
		$show_technologies = rest_sanitize_boolean( $atts['show_technologies'] );

		setup_postdata( $post );

		ob_start();

		$client         = get_post_meta( $post_id, 'project_client', true );
		$completion_date = get_post_meta( $post_id, 'project_completion_date', true );
		$technologies   = get_post_meta( $post_id, 'project_technologies', true );
		$project_url    = get_post_meta( $post_id, 'project_url', true );
		$testimonial    = get_post_meta( $post_id, 'project_testimonial', true );
		$testimonial_author = get_post_meta( $post_id, 'project_testimonial_author', true );
		$terms          = wp_get_post_terms( $post_id, 'project_category', array( 'fields' => 'all' ) );
		?>
		<article id="proportfolio-project-<?php echo esc_attr( $post_id ); ?>" class="proportfolio-single-project" itemscope itemtype="https://schema.org/CreativeWork">
			<header class="proportfolio-single-header">
				<h2 itemprop="name"><?php echo esc_html( get_the_title() ); ?></h2>

				<div class="proportfolio-meta-bar">
					<?php if ( $client ) : ?>
						<span class="project-client" itemprop="client">
							<?php echo esc_html( $client ); ?>
						</span>
					<?php endif; ?>

					<?php if ( $completion_date ) : ?>
						<time class="project-date" datetime="<?php echo esc_attr( $completion_date ); ?>" itemprop="dateCreated">
							<?php echo esc_html( gmdate( 'F Y', strtotime( $completion_date ) ) ); ?>
						</time>
					<?php endif; ?>

					<?php if ( ! empty( $terms ) && ! is_wp_error( $terms ) ) : ?>
						<span class="project-categories">
							<?php
							$term_links = array();
							foreach ( $terms as $term ) {
								$term_links[] = sprintf(
									'<a href="%s" rel="tag">%s</a>',
									esc_url( get_term_link( $term ) ),
									esc_html( $term->name )
								);
							}
								echo wp_kses(
									implode( ', ', $term_links ),
									array( 'a' => array( 'href' => array(), 'rel' => array() ) )
								);
							?>
						</span>
					<?php endif; ?>
				</div>
			</header>

			<?php if ( has_post_thumbnail() ) : ?>
				<figure class="proportfolio-single-image">
					<?php the_post_thumbnail( 'large', array( 'loading' => 'lazy', 'itemprop' => 'image' ) ); ?>
				</figure>
			<?php endif; ?>

			<div class="proportfolio-single-content" itemprop="description">
				<?php the_content(); ?>
			</div>

			<?php if ( $show_technologies && ! empty( $technologies ) && is_array( $technologies ) ) : ?>
				<section class="proportfolio-technologies" aria-label="<?php esc_attr_e( 'Technologies used', 'proportfolio-showcase' ); ?>">
					<h3><?php esc_html_e( 'Technologies', 'proportfolio-showcase' ); ?></h3>
					<ul class="proportfolio-tech-list">
						<?php foreach ( $technologies as $tech ) : ?>
							<li><?php echo esc_html( $tech ); ?></li>
						<?php endforeach; ?>
					</ul>
				</section>
			<?php endif; ?>

			<?php if ( $show_testimonial && ! empty( $testimonial ) ) : ?>
				<aside class="proportfolio-testimonial" aria-label="<?php esc_attr_e( 'Client testimonial', 'proportfolio-showcase' ); ?>">
					<blockquote>
						<p><?php echo esc_html( $testimonial ); ?></p>
						<?php if ( ! empty( $testimonial_author ) ) : ?>
							<cite>&mdash; <?php echo esc_html( $testimonial_author ); ?></cite>
						<?php endif; ?>
					</blockquote>
				</aside>
			<?php endif; ?>

			<?php if ( $project_url ) : ?>
				<footer class="proportfolio-single-footer">
					<a href="<?php echo esc_url( $project_url ); ?>" class="proportfolio-button" target="_blank" rel="noopener noreferrer">
						<?php esc_html_e( 'View Live Project', 'proportfolio-showcase' ); ?>
						<span class="screen-reader-text"><?php echo esc_html( get_the_title() ); ?></span>
					</a>
				</footer>
			<?php endif; ?>
		</article>
		<?php

		wp_reset_postdata();

		return ob_get_clean();
	}

	/**
	 * Fallback inline grid renderer if template file is missing.
	 *
	 * @param \WP_Query $projects     The query result.
	 * @param int       $columns      Number of grid columns.
	 * @param bool      $show_filter  Whether to render filter tabs.
	 * @return void
	 */
	private function render_grid_inline( $projects, $columns, $show_filter ) {
		if ( ! $projects->have_posts() ) {
			echo '<p>' . esc_html__( 'No portfolio projects found.', 'proportfolio-showcase' ) . '</p>';
			return;
		}

		if ( $show_filter ) {
			$terms = get_terms(
				array(
					'taxonomy'   => 'project_category',
					'hide_empty' => true,
				)
			);
			if ( ! empty( $terms ) && ! is_wp_error( $terms ) ) {
				echo '<ul class="proportfolio-filter-tabs" role="tablist" aria-label="' . esc_attr__( 'Filter projects by category', 'proportfolio-showcase' ) . '">';
				echo '<li role="none"><button role="tab" class="proportfolio-filter-active" data-filter="all" aria-selected="true">' . esc_html__( 'All', 'proportfolio-showcase' ) . '</button></li>';
				foreach ( $terms as $term ) {
					echo '<li role="none"><button role="tab" data-filter="' . esc_attr( $term->slug ) . '" aria-selected="false">' . esc_html( $term->name ) . '</button></li>';
				}
				echo '</ul>';
			}
		}

		echo '<div class="proportfolio-grid" style="--columns: ' . esc_attr( (string) $columns ) . '">';

		while ( $projects->have_posts() ) {
			$projects->the_post();
			$post_id    = get_the_ID();
			$technologies = get_post_meta( $post_id, 'project_technologies', true );
			$client     = get_post_meta( $post_id, 'project_client', true );
			?>
			<article id="proportfolio-project-<?php the_ID(); ?>" class="proportfolio-card" itemscope itemtype="https://schema.org/CreativeWork">
				<a href="<?php the_permalink(); ?>" class="proportfolio-card-link">
					<figure class="proportfolio-card-image">
						<?php if ( has_post_thumbnail() ) : ?>
							<?php the_post_thumbnail( 'medium_large', array( 'loading' => 'lazy', 'itemprop' => 'image' ) ); ?>
						<?php else : ?>
							<img
								src="<?php echo esc_url( get_placeholder_thumbnail( $post_id ) ); ?>"
								alt="<?php echo esc_attr( sprintf( __( 'Placeholder image for %s', 'proportfolio-showcase' ), get_the_title() ) ); ?>"
								loading="lazy"
							/>
						<?php endif; ?>
					</figure>

					<figcaption class="proportfolio-card-content">
						<h3 itemprop="name"><?php the_title(); ?></h3>

						<?php if ( has_excerpt() ) : ?>
							<p itemprop="description"><?php echo esc_html( get_the_excerpt() ); ?></p>
						<?php endif; ?>

						<footer class="proportfolio-card-meta">
							<?php if ( $client ) : ?>
								<span class="project-client" itemprop="client"><?php echo esc_html( $client ); ?></span>
							<?php endif; ?>

							<?php if ( ! empty( $technologies ) && is_array( $technologies ) ) : ?>
								<ul class="project-technologies" aria-label="<?php esc_attr_e( 'Technologies used', 'proportfolio-showcase' ); ?>">
									<?php foreach ( array_slice( $technologies, 0, 3 ) as $tech ) : ?>
										<li><?php echo esc_html( $tech ); ?></li>
									<?php endforeach; ?>
									<?php if ( count( $technologies ) > 3 ) : ?>
										<li class="tech-more">+<?php echo esc_html( count( $technologies ) - 3 ); ?></li>
									<?php endif; ?>
								</ul>
							<?php endif; ?>
						</footer>
					</figcaption>
				</a>
			</article>
			<?php
		}

		echo '</div>';
	}
}