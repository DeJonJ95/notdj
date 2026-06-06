<?php
/**
 * Custom WordPress Dashboard Widget for recent portfolio projects.
 *
 * @package ProPortfolio_Showcase
 */

namespace ProPortfolio\Includes;

defined( 'ABSPATH' ) || exit;

/**
 * "Recent Projects" sidebar widget extending WP_Widget.
 */
class Widget_Recent_Projects extends \WP_Widget {

	/**
	 * Register the widget with WordPress.
	 *
	 * @return void
	 */
	public function register() {
		register_widget( __CLASS__ );
	}

	/**
	 * Constructor.
	 */
	public function __construct() {
		$widget_ops = array(
			'classname'   => 'proportfolio-recent-projects',
			'description' => __( 'Display a list of recent portfolio projects.', 'proportfolio-showcase' ),
		);

		parent::__construct(
			'proportfolio_recent_projects',
			__( 'ProPortfolio Recent Projects', 'proportfolio-showcase' ),
			$widget_ops
		);
	}

	/**
	 * Output the widget content.
	 *
	 * @param array $args     Sidebar/widget area arguments.
	 * @param array $instance Saved widget instance values.
	 * @return void
	 */
	public function widget( $args, $instance ) {
		$title = ! empty( $instance['title'] )
			? apply_filters( 'widget_title', $instance['title'], $instance, $this->id_base )
			: __( 'Recent Projects', 'proportfolio-showcase' );

		$count          = isset( $instance['count'] ) ? absint( $instance['count'] ) : 5;
		$show_thumbnail = ! empty( $instance['show_thumbnail'] );
		$show_date      = ! empty( $instance['show_date'] );
		$category       = ! empty( $instance['category'] ) ? sanitize_text_field( $instance['category'] ) : '';

		// Cap count.
		if ( $count < 1 ) {
			$count = 1;
		}
		if ( $count > 20 ) {
			$count = 20;
		}

		$query_args = array(
			'post_type'      => 'portfolio_project',
			'posts_per_page' => $count,
			'post_status'    => 'publish',
			'no_found_rows'  => true,
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

		$projects = new \WP_Query( $query_args );

		if ( ! $projects->have_posts() ) {
			return;
		}

		echo $args['before_widget']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped

		if ( $title ) {
			echo $args['before_title'] . esc_html( $title ) . $args['after_title']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		}

		echo '<ul class="proportfolio-widget-list">';

		while ( $projects->have_posts() ) {
			$projects->the_post();
			$post_id = get_the_ID();
			?>
			<li class="proportfolio-widget-item">
				<a href="<?php the_permalink(); ?>" class="proportfolio-widget-link">
					<?php if ( $show_thumbnail && has_post_thumbnail() ) : ?>
						<span class="proportfolio-widget-thumb">
							<?php the_post_thumbnail( 'thumbnail', array( 'loading' => 'lazy' ) ); ?>
						</span>
					<?php endif; ?>

					<span class="proportfolio-widget-text">
						<span class="proportfolio-widget-title"><?php the_title(); ?></span>

						<?php if ( $show_date ) : ?>
							<span class="proportfolio-widget-date">
								<time datetime="<?php echo esc_attr( get_the_date( 'c' ) ); ?>">
									<?php echo esc_html( get_the_date() ); ?>
								</time>
							</span>
						<?php endif; ?>
					</span>
				</a>
			</li>
			<?php
		}

		echo '</ul>';

		wp_reset_postdata();

		echo $args['after_widget']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}

	/**
	 * Display the widget admin form.
	 *
	 * @param array $instance Current instance settings.
	 * @return void
	 */
	public function form( $instance ) {
		$title          = isset( $instance['title'] ) ? $instance['title'] : '';
		$count          = isset( $instance['count'] ) ? absint( $instance['count'] ) : 5;
		$show_thumbnail = ! empty( $instance['show_thumbnail'] );
		$show_date      = ! empty( $instance['show_date'] );
		$category       = isset( $instance['category'] ) ? $instance['category'] : '';
		?>
		<p>
			<label for="<?php echo esc_attr( $this->get_field_id( 'title' ) ); ?>">
				<?php esc_html_e( 'Title:', 'proportfolio-showcase' ); ?>
			</label>
			<input
				type="text"
				id="<?php echo esc_attr( $this->get_field_id( 'title' ) ); ?>"
				name="<?php echo esc_attr( $this->get_field_name( 'title' ) ); ?>"
				value="<?php echo esc_attr( $title ); ?>"
				class="widefat"
			/>
		</p>

		<p>
			<label for="<?php echo esc_attr( $this->get_field_id( 'count' ) ); ?>">
				<?php esc_html_e( 'Number of projects to show:', 'proportfolio-showcase' ); ?>
			</label>
			<input
				type="number"
				id="<?php echo esc_attr( $this->get_field_id( 'count' ) ); ?>"
				name="<?php echo esc_attr( $this->get_field_name( 'count' ) ); ?>"
				value="<?php echo esc_attr( (string) $count ); ?>"
				min="1"
				max="20"
				class="tiny-text"
				step="1"
			/>
		</p>

		<p>
			<label for="<?php echo esc_attr( $this->get_field_id( 'category' ) ); ?>">
				<?php esc_html_e( 'Category filter (optional):', 'proportfolio-showcase' ); ?>
			</label>
			<select
				id="<?php echo esc_attr( $this->get_field_id( 'category' ) ); ?>"
				name="<?php echo esc_attr( $this->get_field_name( 'category' ) ); ?>"
				class="widefat"
			>
				<option value=""><?php esc_html_e( 'All Categories', 'proportfolio-showcase' ); ?></option>
				<?php
				$terms = get_terms(
					array(
						'taxonomy'   => 'project_category',
						'hide_empty' => true,
					)
				);
				if ( ! empty( $terms ) && ! is_wp_error( $terms ) ) {
					foreach ( $terms as $term ) {
						printf(
							'<option value="%s" %s>%s</option>',
							esc_attr( $term->slug ),
							selected( $category, $term->slug, false ),
							esc_html( $term->name )
						);
					}
				}
				?>
			</select>
		</p>

		<p>
			<label>
				<input
					type="checkbox"
					name="<?php echo esc_attr( $this->get_field_name( 'show_thumbnail' ) ); ?>"
					value="1"
					<?php checked( $show_thumbnail ); ?>
				/>
				<?php esc_html_e( 'Show project thumbnails', 'proportfolio-showcase' ); ?>
			</label>
		</p>

		<p>
			<label>
				<input
					type="checkbox"
					name="<?php echo esc_attr( $this->get_field_name( 'show_date' ) ); ?>"
					value="1"
					<?php checked( $show_date ); ?>
				/>
				<?php esc_html_e( 'Show publish date', 'proportfolio-showcase' ); ?>
			</label>
		</p>
		<?php
	}

	/**
	 * Sanitize widget form values before saving.
	 *
	 * @param array $new_instance New values being saved.
	 * @param array $old_instance Previous values.
	 * @return array Sanitized values.
	 */
	public function update( $new_instance, $old_instance ) {
		$instance = array();

		$instance['title']          = sanitize_text_field( $new_instance['title'] );
		$instance['count']          = absint( $new_instance['count'] );
		$instance['show_thumbnail'] = ! empty( $new_instance['show_thumbnail'] ) ? 1 : 0;
		$instance['show_date']      = ! empty( $new_instance['show_date'] ) ? 1 : 0;
		$instance['category']       = sanitize_text_field( $new_instance['category'] );

		return $instance;
	}
}