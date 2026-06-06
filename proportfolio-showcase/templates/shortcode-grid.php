<?php
/**
 * Template part for [proportfolio_grid] shortcode output.
 *
 * @package ProPortfolio_Showcase
 *
 * @var \WP_Query $projects     The query object.
 * @var int       $columns      Number of grid columns.
 * @var bool      $show_filter  Whether to show category filter tabs.
 */

defined( 'ABSPATH' ) || exit;

if ( ! isset( $projects ) || ! $projects->have_posts() ) {
	echo '<p>' . esc_html__( 'No portfolio projects found.', 'proportfolio-showcase' ) . '</p>';
	return;
}

$columns     = isset( $columns ) ? max( 1, min( 4, absint( $columns ) ) ) : 3;
$show_filter = isset( $show_filter ) ? (bool) $show_filter : true;
?>

<div class="proportfolio-shortcode-wrapper">
	<?php if ( $show_filter ) : ?>
		<?php
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
		<?php endif; ?>
	<?php endif; ?>

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
								<time datetime="<?php echo esc_attr( $completion ); ?>" itemprop="dateCreated">
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
</div>

<?php
wp_reset_postdata();