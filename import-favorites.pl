#!/usr/bin/perl

# This script converts a directory with favorites (*.url files) to an
# indented list with titles and URLs as is used by the favorites.html script.
# The output of this file can be copied into a favorite-links.txt file.
# The input argument is the directory to recursively parse.

use strict;
use File::Spec::Functions qw/catfile/;

my $basedir = shift || ".";

sub process_dir;
sub process_subdir;
sub process_file;

# List of current directory path.
my @subpath;

sub print_link
{
	my ($name, $url) = @_;

	return if $name eq "" && $url eq "";  # nothing to print

	my $indent = "\t" x @subpath;  # current indentation level as steps
	print $indent;
	if ($name ne "")
	{
		print $name;
		print " ", $url if $url ne "";
	}
	else
	{
		print $url;
	}
	print "\n";
}

# Process all entries in this directory in alphanumerical order.
# For each entry, call process_subdir or process_file as appropriate.
sub process_dir
{
	my ($name) = @_;

	my $path = catfile $basedir, @subpath;

	opendir my $dh, $path or die "Cannot open dir '$path': $!";
	foreach (sort { $a cmp $b } readdir $dh)
	{
		next if /^\.\.?$/;
		my $subpath = catfile $path, $_;
		#print "ITEM '$subpath'\n";
		if (-d $subpath)
		{
			process_subdir $_;
		}
		elsif (-f _)
		{
			process_file $_;
		}
		else
		{
			warn "SKIP '$subpath': Unknown type\n";
		}
	}
	closedir $dh;
}

# Print a line for this directory entry.
# Then call process_dir to process the entries.
sub process_subdir
{
	my ($name) = @_;

	print_link $name;

	push @subpath, $name;
	process_dir $name;
	pop @subpath;
}

# Process this file and print the appropriate output.
sub process_file
{
	my ($name) = @_;

	if ($name =~ /^\s*(.+)\.url$/i)
	{
		my $link = $1;
		my $path = catfile $basedir, @subpath, $name;
		my ($baseurl, $url, $icon);
		open my $fh, "<", $path or die "Cannot open '$path': $!";
		foreach (<$fh>)
		{
			if (/^\s*BASEURL\s*=\s*(\S+)/i)
			{
				$baseurl = $1;
			}
			elsif (/^\s*URL\s*=\s*(\S+)/i)
			{
				$url = $1;
			}
			elsif (/^\s*IconFile\s*=\s*(\s+)/i)
			{
				$icon = $1;
			}
		}
		close $fh;
		$url = $baseurl if $url eq "";
		print_link $link, $url;
	}
	else
	{
		warn "SKIP $name: No .url file\n";
	}
}

process_dir $basedir;

