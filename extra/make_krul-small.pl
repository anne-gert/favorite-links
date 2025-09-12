#!/usr/bin/perl

use strict;

# Sources:
#
# krul-wikipedia-nl.svg is copied from https://nl.wikipedia.org/wiki/Goedkeuringskrul
# krul-wikipedia-en.svn is copied from https://en.wikipedia.org/wiki/Flourish_of_approval
#
#
# Pre-Processing:
#
# In Inkscape, the path was simplified and the line was made thicker. This
# contents is in the *-processed.* files.
#
#
# Processing:
#
# To make the output file even smaller:
# - remove unnecessary attributes
# - remove unnecessary spaces
# - remove decimals

my $inname = "krul-wikipedia-nl-processed.svg";
#my $inname = "krul-wikipedia-en-processed.svg";
my $outname = "krul-small.svg";

# Read data and take out the data
open my $fh, "< $inname" or die "Cannot open $inname: $!";
my $data = join "", <$fh>;
close $fh;
(my $path) = $data =~ /<path.*?\bd="(.*?)"/is; 
(my $width) = $data =~ /\bwidth="(\d+(?:\.\d+)?)"/is;
(my $height) = $data =~ /\bheight="(\d+(?:\.\d+)?)"/is;
#print $path;

# Split path into components
my @path = $path =~ m{(
	[a-z]+|                  # any sequence of letters
	(?:[+-]?\d+(?:\.\d*)?)|  # a number with optional fractional part
	(?:[+-]?\.\d+)|          # a number with no digits in front of decimal point
	,                        # a comma
	)}isxg;
# Reconstruct path to verify the split
my $path2 = join " ", @path;
$path2 =~ s/\s,\s/,/g;  # remove spaces around commas
die "Incorrect split" if $path ne $path2;
#print map "$_\n", @path;

# Calculate scale
my $size = ($width > $height) ? $width : $height;
my $new_size = 25;
my $scale = $new_size / $size;

# Make numbers shorter
foreach (@path)
{
	if (/\d/)  # it is a number
	{
		$_ *= $scale;  # scale image
		$_ = sprintf "%.1f", $_;  # round to 1 decimal
		s/^0+//;  # remove leading 0s
		s/0+$//;  # remove trailing 0s
		s/\.$//;  # trailing decimal
		$_ = 0 if $_ eq "";  # set to 0 if nothing left
	}
}
#print map "$_\n", @path;

# Combine to new path
my $path2 = join " ", @path;
$path2 =~ s/(?<!\d)\s+|\s+(?!\d)//g;  # remove all spaces that are not between digits
#print $path2;

# Output to minimal file
my $data2 = qq(<svg width="$new_size" height="$new_size" xmlns="http://www.w3.org/2000/svg"><path d="$path2"/></svg>);
print $data2, "\n";
open my $fh, "> $outname" or die "Cannot open $outname: $!";
print $fh $data2;
close $fh;

