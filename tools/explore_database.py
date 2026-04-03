"""
Database Schema Explorer for Tiphub
Queries PostgreSQL database and generates comprehensive schema documentation.
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from datetime import datetime
import json
from typing import List, Dict, Any, Optional

# Load environment variables
load_dotenv(override=True)

DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT"),
    "database": os.getenv("DB_NAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
}

class DatabaseExplorer:
    """Explores PostgreSQL database and extracts comprehensive schema information."""

    def __init__(self, db_config: Dict[str, str]):
        self.db_config = db_config
        self.conn = None

    def connect(self):
        """Establish database connection."""
        try:
            self.conn = psycopg2.connect(**self.db_config)
            self.conn.autocommit = True  # Enable autocommit to avoid transaction blocks
            print(f"[OK] Connected to database: {self.db_config['database']}")
            return True
        except Exception as e:
            print(f"[ERROR] Failed to connect to database: {e}")
            return False

    def close(self):
        """Close database connection."""
        if self.conn:
            self.conn.close()
            print("[OK] Database connection closed")

    def get_all_tables(self) -> List[Dict[str, Any]]:
        """Get list of all tables in the database (excluding internal and system tables)."""
        query = """
        SELECT
            table_name,
            table_schema,
            table_type
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE '\\_hyper\\_%' ESCAPE '\\'
        AND table_name NOT LIKE '\\_compressed\\_%' ESCAPE '\\'
        AND table_name NOT LIKE '\\_direct\\_%' ESCAPE '\\'
        ORDER BY table_name;
        """

        with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query)
            return cursor.fetchall()

    def get_table_columns(self, table_name: str) -> List[Dict[str, Any]]:
        """Get all columns for a specific table."""
        query = """
        SELECT
            column_name,
            data_type,
            character_maximum_length,
            is_nullable,
            column_default,
            ordinal_position,
            udt_name
        FROM information_schema.columns
        WHERE table_name = %s
        ORDER BY ordinal_position;
        """

        with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query, (table_name,))
            return cursor.fetchall()

    def get_primary_keys(self, table_name: str) -> List[str]:
        """Get primary key columns for a table."""
        query = """
        SELECT a.attname AS column_name
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = %s::regclass
        AND i.indisprimary;
        """

        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query, (table_name,))
                return [row['column_name'] for row in cursor.fetchall()]
        except Exception as e:
            print(f"  Warning: Could not get primary keys for {table_name}: {e}")
            return []

    def get_foreign_keys(self, table_name: str) -> List[Dict[str, Any]]:
        """Get foreign key relationships for a table."""
        query = """
        SELECT
            tc.constraint_name,
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = %s;
        """

        with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query, (table_name,))
            return cursor.fetchall()

    def get_indexes(self, table_name: str) -> List[Dict[str, Any]]:
        """Get all indexes for a table."""
        query = """
        SELECT
            i.relname AS index_name,
            a.attname AS column_name,
            ix.indisunique AS is_unique,
            ix.indisprimary AS is_primary,
            am.amname AS index_type,
            pg_get_indexdef(i.oid) AS index_definition
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_am am ON i.relam = am.oid
        LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        WHERE t.relname = %s
        ORDER BY i.relname, a.attnum;
        """

        with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query, (table_name,))
            return cursor.fetchall()

    def get_table_row_count(self, table_name: str) -> Optional[int]:
        """Get row count for a table."""
        try:
            with self.conn.cursor() as cursor:
                cursor.execute(f"SELECT COUNT(*) FROM {table_name};")
                return cursor.fetchone()[0]
        except Exception as e:
            print(f"  Warning: Could not get row count for {table_name}: {e}")
            return None

    def get_table_size(self, table_name: str) -> Optional[str]:
        """Get table size in human-readable format."""
        query = """
        SELECT pg_size_pretty(pg_total_relation_size(%s)) AS size;
        """

        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query, (table_name,))
                result = cursor.fetchone()
                return result['size'] if result else None
        except Exception as e:
            print(f"  Warning: Could not get size for {table_name}: {e}")
            return None

    def get_sample_data(self, table_name: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Get sample rows from a table."""
        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(f"SELECT * FROM {table_name} LIMIT {limit};")
                rows = cursor.fetchall()
                # Convert to regular dict for JSON serialization
                return [dict(row) for row in rows]
        except Exception as e:
            print(f"  Warning: Could not get sample data for {table_name}: {e}")
            return []

    def get_unique_constraints(self, table_name: str) -> List[Dict[str, Any]]:
        """Get unique constraints for a table."""
        query = """
        SELECT
            tc.constraint_name,
            kcu.column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'UNIQUE'
        AND tc.table_name = %s;
        """

        with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query, (table_name,))
            return cursor.fetchall()

    def get_check_constraints(self, table_name: str) -> List[Dict[str, Any]]:
        """Get check constraints for a table."""
        query = """
        SELECT
            con.conname AS constraint_name,
            pg_get_constraintdef(con.oid) AS constraint_definition
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = %s
        AND con.contype = 'c';
        """

        with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query, (table_name,))
            return cursor.fetchall()

    def get_continuous_aggregates(self) -> List[Dict[str, Any]]:
        """Get all TimescaleDB continuous aggregates."""
        query = """
        SELECT
            view_name,
            view_owner,
            materialization_hypertable_schema,
            materialization_hypertable_name,
            view_definition
        FROM timescaledb_information.continuous_aggregates
        ORDER BY view_name;
        """

        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query)
                return cursor.fetchall()
        except Exception as e:
            print(f"  Warning: Could not get continuous aggregates: {e}")
            return []

    def get_materialized_views(self) -> List[Dict[str, Any]]:
        """Get all standard PostgreSQL materialized views (non-TimescaleDB)."""
        query = """
        SELECT
            schemaname,
            matviewname as viewname,
            matviewowner as viewowner,
            tablespace,
            hasindexes,
            ispopulated,
            definition
        FROM pg_matviews
        WHERE schemaname = 'public'
        AND matviewname NOT IN (
            SELECT view_name
            FROM timescaledb_information.continuous_aggregates
        )
        ORDER BY matviewname;
        """

        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query)
                return cursor.fetchall()
        except Exception as e:
            print(f"  Warning: Could not get materialized views: {e}")
            return []

    def get_refresh_policies(self, view_name: str) -> Optional[Dict[str, Any]]:
        """Get refresh policy for a continuous aggregate."""
        query = """
        SELECT
            schedule_interval,
            start_offset,
            end_offset,
            config
        FROM timescaledb_information.jobs j
        JOIN timescaledb_information.continuous_aggregates ca
            ON ca.materialization_hypertable_name =
               (SELECT split_part(j.config::text, '"', 4))
        WHERE ca.view_name = %s
        AND j.proc_name = 'policy_refresh_continuous_aggregate';
        """

        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query, (view_name,))
                result = cursor.fetchone()
                return dict(result) if result else None
        except Exception as e:
            print(f"  Warning: Could not get refresh policy for {view_name}: {e}")
            return None

    def get_aggregate_details(self, view_name: str) -> Dict[str, Any]:
        """Get comprehensive details about a continuous aggregate."""
        details = {
            'view_name': view_name,
            'row_count': self.get_table_row_count(view_name),
            'size': self.get_table_size(view_name),
            'indexes': self.get_indexes(view_name),
            'refresh_policy': self.get_refresh_policies(view_name)
        }

        # Get source hypertable info
        query = """
        SELECT
            view_name,
            materialization_hypertable_schema || '.' || materialization_hypertable_name as mat_hypertable,
            view_definition
        FROM timescaledb_information.continuous_aggregates
        WHERE view_name = %s;
        """

        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query, (view_name,))
                result = cursor.fetchone()
                if result:
                    details['mat_hypertable'] = result['mat_hypertable']
                    details['view_definition'] = result['view_definition']
        except Exception as e:
            print(f"  Warning: Could not get aggregate details for {view_name}: {e}")

        # Get retention policy
        retention_query = """
        SELECT
            drop_after
        FROM timescaledb_information.jobs j
        JOIN timescaledb_information.continuous_aggregates ca
            ON ca.materialization_hypertable_name =
               (SELECT split_part(j.config::text, '"', 4))
        WHERE ca.view_name = %s
        AND j.proc_name = 'policy_retention';
        """

        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(retention_query, (view_name,))
                result = cursor.fetchone()
                details['retention_policy'] = result['drop_after'] if result else None
        except Exception as e:
            details['retention_policy'] = None

        return details

    def get_database_stats(self) -> Dict[str, Any]:
        """Get overall database statistics."""
        stats = {}

        # Database size
        with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT pg_size_pretty(pg_database_size(current_database())) AS size;")
            stats['database_size'] = cursor.fetchone()['size']

        # Get all tables
        tables = self.get_all_tables()
        stats['total_tables'] = len(tables)

        # Count tables with data
        tables_with_data = 0
        for table in tables:
            count = self.get_table_row_count(table['table_name'])
            if count and count > 0:
                tables_with_data += 1

        stats['tables_with_data'] = tables_with_data
        stats['empty_tables'] = stats['total_tables'] - tables_with_data

        # Get continuous aggregates count
        continuous_aggregates = self.get_continuous_aggregates()
        stats['continuous_aggregates'] = len(continuous_aggregates)

        # Get materialized views count
        materialized_views = self.get_materialized_views()
        stats['materialized_views'] = len(materialized_views)

        return stats

    def explore_full_schema(self) -> Dict[str, Any]:
        """Explore complete database schema."""
        print("\n" + "="*80)
        print("DATABASE SCHEMA EXPLORATION")
        print("="*80 + "\n")

        schema_info = {
            'database': self.db_config['database'],
            'host': self.db_config['host'],
            'exploration_date': datetime.now().isoformat(),
            'stats': self.get_database_stats(),
            'tables': [],
            'continuous_aggregates': [],
            'materialized_views': []
        }

        print(f"Database: {schema_info['database']}")
        print(f"Total Tables: {schema_info['stats']['total_tables']}")
        print(f"Tables with Data: {schema_info['stats']['tables_with_data']}")
        print(f"Empty Tables: {schema_info['stats']['empty_tables']}")
        print(f"Continuous Aggregates: {schema_info['stats']['continuous_aggregates']}")
        print(f"Materialized Views: {schema_info['stats']['materialized_views']}")
        print(f"Database Size: {schema_info['stats']['database_size']}\n")

        # Get all tables
        tables = self.get_all_tables()

        for table_info in tables:
            table_name = table_info['table_name']
            print(f"Exploring table: {table_name}...")

            table_data = {
                'name': table_name,
                'schema': table_info['table_schema'],
                'type': table_info['table_type'],
                'columns': self.get_table_columns(table_name),
                'primary_keys': self.get_primary_keys(table_name),
                'foreign_keys': self.get_foreign_keys(table_name),
                'indexes': self.get_indexes(table_name),
                'unique_constraints': self.get_unique_constraints(table_name),
                'check_constraints': self.get_check_constraints(table_name),
                'row_count': self.get_table_row_count(table_name),
                'size': self.get_table_size(table_name),
                'sample_data': []
            }

            # Get sample data if table has rows
            if table_data['row_count'] and table_data['row_count'] > 0:
                table_data['sample_data'] = self.get_sample_data(table_name, limit=5)

            schema_info['tables'].append(table_data)
            print(f"  [OK] Row count: {table_data['row_count']}")
            print(f"  [OK] Size: {table_data['size']}\n")

        # Explore continuous aggregates
        print("\n" + "="*80)
        print("EXPLORING CONTINUOUS AGGREGATES")
        print("="*80 + "\n")

        continuous_aggregates = self.get_continuous_aggregates()
        for agg in continuous_aggregates:
            view_name = agg['view_name']
            print(f"Exploring continuous aggregate: {view_name}...")

            agg_details = self.get_aggregate_details(view_name)
            agg_data = {
                'view_name': view_name,
                'view_owner': agg['view_owner'],
                'mat_hypertable_schema': agg['materialization_hypertable_schema'],
                'mat_hypertable_name': agg['materialization_hypertable_name'],
                'view_definition': agg.get('view_definition'),
                'row_count': agg_details['row_count'],
                'size': agg_details['size'],
                'indexes': agg_details['indexes'],
                'refresh_policy': agg_details.get('refresh_policy'),
                'retention_policy': agg_details.get('retention_policy'),
                'mat_hypertable': agg_details.get('mat_hypertable')
            }

            schema_info['continuous_aggregates'].append(agg_data)
            print(f"  [OK] Row count: {agg_data['row_count']}")
            print(f"  [OK] Size: {agg_data['size']}")
            if agg_data['refresh_policy']:
                print(f"  [OK] Refresh policy: {agg_data['refresh_policy'].get('schedule_interval')}")
            if agg_data['retention_policy']:
                print(f"  [OK] Retention policy: {agg_data['retention_policy']}\n")
            else:
                print()

        # Explore materialized views
        print("\n" + "="*80)
        print("EXPLORING MATERIALIZED VIEWS")
        print("="*80 + "\n")

        materialized_views = self.get_materialized_views()
        if materialized_views:
            for mv in materialized_views:
                view_name = mv['viewname']
                print(f"Exploring materialized view: {view_name}...")

                mv_data = {
                    'viewname': view_name,
                    'schema': mv['schemaname'],
                    'owner': mv['viewowner'],
                    'tablespace': mv.get('tablespace'),
                    'has_indexes': mv['hasindexes'],
                    'is_populated': mv['ispopulated'],
                    'definition': mv.get('definition'),
                    'row_count': self.get_table_row_count(view_name),
                    'size': self.get_table_size(view_name),
                    'indexes': self.get_indexes(view_name) if mv['hasindexes'] else []
                }

                schema_info['materialized_views'].append(mv_data)
                print(f"  [OK] Row count: {mv_data['row_count']}")
                print(f"  [OK] Size: {mv_data['size']}")
                print(f"  [OK] Populated: {mv_data['is_populated']}\n")
        else:
            print("No standard materialized views found (only continuous aggregates).\n")

        return schema_info


def format_column_type(col: Dict[str, Any]) -> str:
    """Format column data type with length if applicable."""
    data_type = col['data_type']
    if col['character_maximum_length']:
        return f"{data_type}({col['character_maximum_length']})"
    elif col['udt_name'] and col['udt_name'] != data_type:
        return col['udt_name']
    return data_type


def generate_documentation(schema_info: Dict[str, Any], output_file: str = 'docs/db-schema.txt'):
    """Generate comprehensive documentation file."""

    with open(output_file, 'w', encoding='utf-8') as f:
        # Header
        f.write("="*80 + "\n")
        f.write("TIPHUB DATABASE SCHEMA DOCUMENTATION\n")
        f.write("="*80 + "\n\n")

        # Database overview
        f.write(f"Database: {schema_info['database']}\n")
        f.write(f"Host: {schema_info['host']}\n")
        f.write(f"Generated: {schema_info['exploration_date']}\n\n")

        f.write("DATABASE STATISTICS\n")
        f.write("-" * 80 + "\n")
        stats = schema_info['stats']
        f.write(f"Total Tables:           {stats['total_tables']}\n")
        f.write(f"Tables with Data:       {stats['tables_with_data']}\n")
        f.write(f"Empty Tables:           {stats['empty_tables']}\n")
        f.write(f"Continuous Aggregates:  {stats['continuous_aggregates']}\n")
        f.write(f"Materialized Views:     {stats['materialized_views']}\n")
        f.write(f"Database Size:          {stats['database_size']}\n\n")

        # Tables directory
        f.write("\n" + "="*80 + "\n")
        f.write("TABLES DIRECTORY\n")
        f.write("="*80 + "\n\n")

        for table in sorted(schema_info['tables'], key=lambda x: x['name']):
            row_count = table['row_count'] if table['row_count'] is not None else 'N/A'
            size = table['size'] if table['size'] else 'N/A'
            f.write(f"  {table['name']:<40} {str(row_count):>15} rows    {size:>10}\n")

        # Detailed table schemas
        f.write("\n\n" + "="*80 + "\n")
        f.write("DETAILED TABLE SCHEMAS\n")
        f.write("="*80 + "\n\n")

        for table in sorted(schema_info['tables'], key=lambda x: x['name']):
            f.write("\n" + "-"*80 + "\n")
            f.write(f"TABLE: {table['name']}\n")
            f.write("-"*80 + "\n\n")

            f.write(f"Schema: {table['schema']}\n")
            f.write(f"Type: {table['type']}\n")
            f.write(f"Row Count: {table['row_count'] if table['row_count'] is not None else 'N/A'}\n")
            f.write(f"Size: {table['size'] if table['size'] else 'N/A'}\n\n")

            # Columns
            f.write("COLUMNS:\n")
            for col in table['columns']:
                col_type = format_column_type(col)
                nullable = "NULL" if col['is_nullable'] == 'YES' else "NOT NULL"
                default = f"DEFAULT {col['column_default']}" if col['column_default'] else ""
                pk_marker = " [PK]" if col['column_name'] in table['primary_keys'] else ""

                f.write(f"  {col['column_name']:<30} {col_type:<20} {nullable:<10} {default}{pk_marker}\n")

            # Primary Keys
            if table['primary_keys']:
                f.write(f"\nPRIMARY KEY: ({', '.join(table['primary_keys'])})\n")

            # Foreign Keys
            if table['foreign_keys']:
                f.write("\nFOREIGN KEYS:\n")
                for fk in table['foreign_keys']:
                    f.write(f"  {fk['column_name']} -> {fk['foreign_table_name']}({fk['foreign_column_name']})\n")

            # Unique Constraints
            if table['unique_constraints']:
                f.write("\nUNIQUE CONSTRAINTS:\n")
                for uc in table['unique_constraints']:
                    f.write(f"  {uc['constraint_name']}: {uc['column_name']}\n")

            # Check Constraints
            if table['check_constraints']:
                f.write("\nCHECK CONSTRAINTS:\n")
                for cc in table['check_constraints']:
                    f.write(f"  {cc['constraint_name']}: {cc['constraint_definition']}\n")

            # Indexes
            if table['indexes']:
                f.write("\nINDEXES:\n")
                # Group indexes by name
                indexes_dict = {}
                for idx in table['indexes']:
                    idx_name = idx['index_name']
                    if idx_name not in indexes_dict:
                        indexes_dict[idx_name] = {
                            'columns': [],
                            'is_unique': idx['is_unique'],
                            'is_primary': idx['is_primary'],
                            'type': idx['index_type'],
                            'definition': idx['index_definition']
                        }
                    if idx['column_name']:
                        indexes_dict[idx_name]['columns'].append(idx['column_name'])

                for idx_name, idx_info in indexes_dict.items():
                    unique_str = "UNIQUE " if idx_info['is_unique'] else ""
                    primary_str = "[PRIMARY] " if idx_info['is_primary'] else ""
                    cols = ', '.join(idx_info['columns']) if idx_info['columns'] else 'N/A'
                    f.write(f"  {primary_str}{unique_str}{idx_name} ({cols}) - {idx_info['type']}\n")
                    f.write(f"    Definition: {idx_info['definition']}\n")

            # Sample Data
            if table['sample_data']:
                f.write(f"\nSAMPLE DATA (first 5 rows):\n")
                for i, row in enumerate(table['sample_data'], 1):
                    f.write(f"\n  Row {i}:\n")
                    for key, value in row.items():
                        # Handle special types
                        if value is None:
                            display_value = "NULL"
                        elif isinstance(value, (dict, list)):
                            display_value = json.dumps(value, indent=4)[:200] + "..." if len(str(value)) > 200 else json.dumps(value, indent=4)
                        elif isinstance(value, datetime):
                            display_value = value.isoformat()
                        else:
                            display_value = str(value)[:100] + "..." if len(str(value)) > 100 else str(value)

                        f.write(f"    {key}: {display_value}\n")

            f.write("\n")

        # Relationships diagram
        f.write("\n" + "="*80 + "\n")
        f.write("TABLE RELATIONSHIPS (Foreign Keys)\n")
        f.write("="*80 + "\n\n")

        all_relationships = []
        for table in schema_info['tables']:
            for fk in table['foreign_keys']:
                all_relationships.append({
                    'from_table': table['name'],
                    'from_column': fk['column_name'],
                    'to_table': fk['foreign_table_name'],
                    'to_column': fk['foreign_column_name']
                })

        if all_relationships:
            for rel in sorted(all_relationships, key=lambda x: (x['from_table'], x['to_table'])):
                f.write(f"{rel['from_table']}.{rel['from_column']} -> {rel['to_table']}.{rel['to_column']}\n")
        else:
            f.write("No foreign key relationships found.\n")

        # Summary of indexes
        f.write("\n\n" + "="*80 + "\n")
        f.write("INDEXES SUMMARY\n")
        f.write("="*80 + "\n\n")

        for table in sorted(schema_info['tables'], key=lambda x: x['name']):
            if table['indexes']:
                f.write(f"\n{table['name']}:\n")
                indexes_dict = {}
                for idx in table['indexes']:
                    idx_name = idx['index_name']
                    if idx_name not in indexes_dict:
                        indexes_dict[idx_name] = idx

                for idx_name, idx in indexes_dict.items():
                    f.write(f"  - {idx_name} ({idx['index_type']})\n")

        # Continuous Aggregates Section
        f.write("\n\n" + "="*80 + "\n")
        f.write("CONTINUOUS AGGREGATES (TimescaleDB)\n")
        f.write("="*80 + "\n\n")

        if schema_info['continuous_aggregates']:
            # Summary
            f.write("SUMMARY:\n")
            f.write("-" * 80 + "\n")
            for agg in sorted(schema_info['continuous_aggregates'], key=lambda x: x['view_name']):
                row_count = agg['row_count'] if agg['row_count'] is not None else 'N/A'
                size = agg['size'] if agg['size'] else 'N/A'
                mat_table = agg.get('mat_hypertable_name', 'N/A')
                f.write(f"  {agg['view_name']:<30} {str(row_count):>15} rows    {size:>10}    (from: {mat_table})\n")

            # Detailed information
            f.write("\n\nDETAILED CONTINUOUS AGGREGATE INFORMATION:\n")
            f.write("="*80 + "\n")

            for agg in sorted(schema_info['continuous_aggregates'], key=lambda x: x['view_name']):
                f.write("\n" + "-"*80 + "\n")
                f.write(f"CONTINUOUS AGGREGATE: {agg['view_name']}\n")
                f.write("-"*80 + "\n\n")

                f.write(f"Owner: {agg['view_owner']}\n")
                f.write(f"Materialization Hypertable: {agg['mat_hypertable_schema']}.{agg['mat_hypertable_name']}\n")
                f.write(f"Row Count: {agg['row_count'] if agg['row_count'] is not None else 'N/A'}\n")
                f.write(f"Size: {agg['size'] if agg['size'] else 'N/A'}\n\n")

                # Refresh Policy
                if agg.get('refresh_policy'):
                    f.write("REFRESH POLICY:\n")
                    refresh = agg['refresh_policy']
                    f.write(f"  Schedule Interval: {refresh.get('schedule_interval', 'N/A')}\n")
                    f.write(f"  Start Offset: {refresh.get('start_offset', 'N/A')}\n")
                    f.write(f"  End Offset: {refresh.get('end_offset', 'N/A')}\n\n")
                else:
                    f.write("REFRESH POLICY: None configured\n\n")

                # Retention Policy
                if agg.get('retention_policy'):
                    f.write(f"RETENTION POLICY: {agg['retention_policy']}\n\n")
                else:
                    f.write("RETENTION POLICY: No retention policy (indefinite)\n\n")

                # View Definition
                if agg.get('view_definition'):
                    f.write("VIEW DEFINITION:\n")
                    # Format the SQL nicely (basic formatting)
                    sql = agg['view_definition'].strip()
                    f.write(f"{sql}\n\n")

                # Indexes
                if agg.get('indexes'):
                    f.write("INDEXES:\n")
                    indexes_dict = {}
                    for idx in agg['indexes']:
                        idx_name = idx['index_name']
                        if idx_name not in indexes_dict:
                            indexes_dict[idx_name] = {
                                'columns': [],
                                'is_unique': idx['is_unique'],
                                'is_primary': idx['is_primary'],
                                'type': idx['index_type'],
                                'definition': idx['index_definition']
                            }
                        if idx['column_name']:
                            indexes_dict[idx_name]['columns'].append(idx['column_name'])

                    for idx_name, idx_info in indexes_dict.items():
                        unique_str = "UNIQUE " if idx_info['is_unique'] else ""
                        primary_str = "[PRIMARY] " if idx_info['is_primary'] else ""
                        cols = ', '.join(idx_info['columns']) if idx_info['columns'] else 'N/A'
                        f.write(f"  {primary_str}{unique_str}{idx_name} ({cols}) - {idx_info['type']}\n")
                        f.write(f"    Definition: {idx_info['definition']}\n")
                    f.write("\n")

            # Aggregate hierarchy
            f.write("\n" + "="*80 + "\n")
            f.write("AGGREGATE HIERARCHY\n")
            f.write("="*80 + "\n\n")
            f.write("Data flow from source tables to continuous aggregates:\n\n")

            # Group by source table
            source_map = {}
            for agg in schema_info['continuous_aggregates']:
                source = agg.get('mat_hypertable_name', 'unknown')
                if source not in source_map:
                    source_map[source] = []
                source_map[source].append(agg['view_name'])

            for source, aggregates in sorted(source_map.items()):
                f.write(f"{source} (source hypertable)\n")
                for agg_name in sorted(aggregates):
                    f.write(f"  └─> {agg_name}\n")
                f.write("\n")

        else:
            f.write("No continuous aggregates found in the database.\n")

        # Materialized Views Section
        f.write("\n" + "="*80 + "\n")
        f.write("MATERIALIZED VIEWS (Standard PostgreSQL)\n")
        f.write("="*80 + "\n\n")

        if schema_info['materialized_views']:
            # Summary
            f.write("SUMMARY:\n")
            f.write("-" * 80 + "\n")
            for mv in sorted(schema_info['materialized_views'], key=lambda x: x['viewname']):
                row_count = mv['row_count'] if mv['row_count'] is not None else 'N/A'
                size = mv['size'] if mv['size'] else 'N/A'
                populated = "✓" if mv['is_populated'] else "✗"
                f.write(f"  {mv['viewname']:<30} {str(row_count):>15} rows    {size:>10}    Populated: {populated}\n")

            # Detailed information
            f.write("\n\nDETAILED MATERIALIZED VIEW INFORMATION:\n")
            f.write("="*80 + "\n")

            for mv in sorted(schema_info['materialized_views'], key=lambda x: x['viewname']):
                f.write("\n" + "-"*80 + "\n")
                f.write(f"MATERIALIZED VIEW: {mv['viewname']}\n")
                f.write("-"*80 + "\n\n")

                f.write(f"Schema: {mv['schema']}\n")
                f.write(f"Owner: {mv['owner']}\n")
                f.write(f"Tablespace: {mv.get('tablespace', 'default')}\n")
                f.write(f"Has Indexes: {mv['has_indexes']}\n")
                f.write(f"Is Populated: {mv['is_populated']}\n")
                f.write(f"Row Count: {mv['row_count'] if mv['row_count'] is not None else 'N/A'}\n")
                f.write(f"Size: {mv['size'] if mv['size'] else 'N/A'}\n\n")

                # View Definition
                if mv.get('definition'):
                    f.write("VIEW DEFINITION:\n")
                    sql = mv['definition'].strip()
                    f.write(f"{sql}\n\n")

                # Indexes
                if mv.get('indexes'):
                    f.write("INDEXES:\n")
                    indexes_dict = {}
                    for idx in mv['indexes']:
                        idx_name = idx['index_name']
                        if idx_name not in indexes_dict:
                            indexes_dict[idx_name] = idx

                    for idx_name, idx in indexes_dict.items():
                        f.write(f"  - {idx_name} ({idx['index_type']})\n")
                    f.write("\n")

        else:
            f.write("No standard materialized views found.\n")
            f.write("(Note: TimescaleDB continuous aggregates are shown in the previous section)\n")

    print(f"\n[OK] Documentation written to: {output_file}")


def main():
    """Main execution function."""
    print("\nTiphub Database Schema Explorer")
    print("="*80)

    explorer = DatabaseExplorer(DB_CONFIG)

    if not explorer.connect():
        return

    try:
        # Explore schema
        schema_info = explorer.explore_full_schema()

        # Generate documentation
        generate_documentation(schema_info, 'docs/db-schema.txt')

        print("\n" + "="*80)
        print("EXPLORATION COMPLETE!")
        print("="*80)
        print(f"\nDocumentation file created: docs/db-schema.txt")
        print(f"Total tables explored: {len(schema_info['tables'])}")
        print(f"Tables with data: {schema_info['stats']['tables_with_data']}")

    except Exception as e:
        print(f"\n[ERROR] Error during exploration: {e}")
        import traceback
        traceback.print_exc()

    finally:
        explorer.close()


if __name__ == "__main__":
    main()
