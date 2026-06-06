<?php
/**
 * Server-side render callback for the Portfolio Grid block.
 *
 * @package ProPortfolio_Showcase
 *
 * @var array $attributes Block attributes.
 */

defined( 'ABSPATH' ) || exit;

// Sanitize attributes.
$count        = isset( $attributes['count'] ) ? absint( $attributes['count'] ) : 6;
$columns      = isset( $attributes['columns'] ) ? max( 1, min( 4, absint( $attributes['columns'] ) ) ) : 3;
$category     = isset( $attributes['category'] ) ? sanitize_text_field( $attributes['category'] ) : '';
$show_filter  = isset( $attributes['showFilter'] ) ? (bool) $attributes['showFilter'] : true;
$orderby      = isset( $attributes['orderby'] ) && in_array( $attributes['orderby'], array( 'date', 'title', 'rand' ), true ) ? $attributes['orderby'] : 'date';
$order        = isset( $attributes['order'] ) && in_array( strtoupper( $attributes['order'] ), array( 'ASC', 'DESC' ), true ) ? strtoupper( $attributes['order'] ) : 'DESC';
$featured_only = isset( $attributes['featuredOnly'] ) ? (bool) $attributes['featuredOnly'] : false;

// Cap the count.
$count = max( 1, min( 48, $count ) );

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'proportfolio-block-wrapper' ) );

$query_args = array(
	'post_type'      => 'portfolio_project',
	'posts_per_page' => $count,
	'post_status'    => 'publish',
	'orderby'        => $orderby,
	'order'          => $order,
	'no_found_rows'  => false,
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

$projects = new WP_Query( $query_args );

if ( ! $projects->have_posts() ) {
	printf(
		'<div %s><p>%s</p></div>',
		wp_kses_data( $wrapper_attributes ),
		esc_html__( 'No portfolio projects found.', 'proportfolio-showcase' )
	);
	return;
}

// Pagination.
$paged     = max( 1, get_query_var( 'paged', 1 ) );
$max_pages = $projects->max_num_pages;
?>

<div <?php echo wp_kses_data( $wrapper_attributes ); ?>>
	<?php
	// Category filter tabs.
	if ( $show_filter ) {
		$terms = get_terms(
			array(
				'taxonomy'   => 'project_category',
				'hide_empty' => true,
			)
		);

		if ( ! empty( $terms ) && ! is_wp_error( $terms ) ) :
			?>
			<ul class="proportfolio-filter-tabs" role="tablist" aria-label="<?php esc_attr_e( 'Filter projects by category', 'proportfolio-showcase' ); ?>">
				<li role="none">
					<button role="tab" class="proportfolio-filter-active" data-filter="all" aria-selected="true">
						<?php esc_html_e( 'All', 'proportfolio-showcase' ); ?>
					</button>
				</li>
				<?php foreach ( $terms as $term ) : ?>
					<li role="none">
						<button role="tab" data-filter="<?php echo esc_attr( $term->slug ); ?>" aria-selected="false">
							<?php echo esc_html( $term->name ); ?>
						</button>
					</li>
				<?php endforeach; ?>
			</ul>
			<?php
		endif;
	}
	?>

	<div class="proportfolio-grid" style="--columns: <?php echo esc_attr( (string) $columns ); ?>">
		<?php
		while ( $projects->have_posts() ) :
			$projects->the_post();
			$post_id      = get_the_ID();
			$technologies = get_post_meta( $post_id, 'project_technologies', true );
			$client       = get_post_meta( $post_id, 'project_client', true );
			$completion   = get_post_meta( $post_id, 'project_completion_date', true );
			$cat_terms    = wp_get_post_terms( $post_id, 'project_category', array( 'fields' => 'slugs' ) );
			$data_cats    = ! empty( $cat_terms ) && ! is_wp_error( $cat_terms ) ? implode( ' ', $cat_terms ) : '';
			?>
			<article id="proportfolio-project-<?php the_ID(); ?>" class="proportfolio-card" itemscope itemtype="https://schema.org/CreativeWork" data-categories="<?php echo esc_attr( $data_cats ); ?>">
				<a href="<?php the_permalink(); ?>" class="proportfolio-card-link">
					<figure class="proportfolio-card-image">
						<?php if ( has_post_thumbnail() ) : ?>
							<?php the_post_thumbnail( 'medium_large', array( 'loading' => 'lazy', 'itemprop' => 'image' ) ); ?>
						<?php else : ?>
							<img
								src="<?php echo esc_url( \ProPortfolio\Includes\get_placeholder_thumbnail( $post_id ) ); ?>"
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

							<?php if ( $completion ) : ?>
								<time class="project-date" datetime="<?php echo esc_attr( $completion ); ?>" itemprop="dateCreated">
									<?php echo esc_html( gmdate( 'M Y', strtotime( $completion ) ) ); ?>
								</time>
							<?php endif; ?>
						</footer>

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
					</figcaption>
				</a>
			</article>
		<?php endwhile; ?>
	</div>

	<?php
	// Pagination.
	if ( $max_pages > 1 ) :
		?>
		<nav class="proportfolio-pagination" aria-label="<?php esc_attr_e( 'Portfolio projects pagination', 'proportfolio-showcase' ); ?>">
			<?php
			echo wp_kses_post(
				paginate_links(
					array(
						'total'   => $max_pages,
						'current' => $paged,
						'type'    => 'list',
						'prev_text' => sprintf(
							'<span aria-hidden="true">&laquo;</span><span class="screen-reader-text">%s</span>',
							__( 'Previous page', 'proportfolio-showcase' )
						),
						'next_text' => sprintf(
							'<span aria-hidden="true">&raquo;</span><span class="screen-reader-text">%s</span>',
							__( 'Next page', 'proportfolio-showcase' )
						),
					)
				)
			);
			?>
		</nav>
	<?php endif; ?>
</div>

<?php
wp_reset_postdata();