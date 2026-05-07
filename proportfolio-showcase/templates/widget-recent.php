<?php
/**
 * Template part for the ProPortfolio Recent Projects widget output.
 *
 * @package ProPortfolio_Showcase
 *
 * @var \WP_Query $projects      The query object.
 * @var bool      $show_thumbnail Whether to show thumbnails.
 * @var bool      $show_date      Whether to show dates.
 */

defined( 'ABSPATH' ) || exit;

if ( ! isset( $projects ) || ! $projects->have_posts() ) {
	return;
}
?>
<ul class="proportfolio-widget-list">
	<?php
	while ( $projects->have_posts() ) :
		$projects->the_post();
		?>
		<li class="proportfolio-widget-item">
			<a href="<?php the_permalink(); ?>" class="proportfolio-widget-link">
				<?php if ( ! empty( $show_thumbnail ) && has_post_thumbnail() ) : ?>
					<span class="proportfolio-widget-thumb">
						<?php the_post_thumbnail( 'thumbnail', array( 'loading' => 'lazy' ) ); ?>
					</span>
				<?php endif; ?>

				<span class="proportfolio-widget-text">
					<span class="proportfolio-widget-title"><?php the_title(); ?></span>

					<?php if ( ! empty( $show_date ) ) : ?>
						<span class="proportfolio-widget-date">
							<time datetime="<?php echo esc_attr( get_the_date( 'c' ) ); ?>">
								<?php echo esc_html( get_the_date() ); ?>
							</time>
						</span>
					<?php endif; ?>
				</span>
			</a>
		</li>
	<?php endwhile; ?>
</ul><?php

wp_reset_postdata();