var livereload = require('gulp-livereload'),
    gulp = require('gulp')
   ;


gulp.task('htmlWatch', function() {
    console.log('reload because of changed html');
    return gulp.src('./index.html')
        .pipe(livereload());
});

gulp.task('jsWatch', function() {
    console.log('reload because of changed js');
    return gulp.src('./js/main.js')
        .pipe(livereload());
});

gulp.task('cssWatch', function() {
    console.log('reload because of changed css');
    return gulp.src('./css/main.css')
        .pipe(livereload());
});

gulp.task('watch', function() {
    livereload.listen();
    gulp.watch('./css/*.css', ['cssWatch']);
    gulp.watch('./index.html', ['htmlWatch']);
    gulp.watch('./js/main.js', ['jsWatch']);
});


gulp.task('default', function() {
    // place code for your default task here
});


