--
-- PostgreSQL database dump
--

\restrict XCeTZQdT2dZ4aOJEKdVhceyE8cBEzt22uw58WILgHWqaO2Y7GDUYzoS93xiNd2n

-- Dumped from database version 17.4
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: -
--

COPY storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) FROM stdin;
event-posters	event-posters	\N	2025-09-09 07:41:31.436276+00	2025-09-09 07:41:31.436276+00	t	f	\N	\N	\N	STANDARD
registration-files	registration-files	\N	2025-09-09 07:41:31.436276+00	2025-09-09 07:41:31.436276+00	f	f	\N	\N	\N	STANDARD
player-photos	player-photos	\N	2025-09-16 02:11:14.456516+00	2025-09-16 02:11:14.456516+00	t	f	5242880	{image/jpeg,image/png,image/jpg}	\N	STANDARD
\.


--
-- PostgreSQL database dump complete
--

\unrestrict XCeTZQdT2dZ4aOJEKdVhceyE8cBEzt22uw58WILgHWqaO2Y7GDUYzoS93xiNd2n

